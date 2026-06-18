## Context

El dashboard de Phase 3 ya pinta el banner "Precio desactualizado" y los glyphs `⏱` / `≈` cuando una cotización está stale o estimada (`src/components/charts/summary-cards.tsx:52-65`, `src/components/charts/distribution-chart.tsx:47-63`). El cálculo de staleness vive en `src/lib/dashboard/snapshot.ts:47-70` y depende exclusivamente de `market_prices.observed_at` vs `STALE_PRICE_MS = 2 h` (`src/lib/market-data/types.ts:107`).

El único `PriceProvider` registrado es Yahoo Finance (`src/lib/market-data/yahoo.ts:49`) y la Edge Function `sync-prices` (`supabase/functions/sync-prices/index.ts:163`) llama directamente a `fetchYahooQuote`. No hay fallback, no hay backoff, no hay segundo provider. Cuando Yahoo devuelve 429/5xx, la fila no se actualiza y el siguiente tick (30 min) puede volver a fallar — el dashboard muestra el banner sin contexto.

`market_sync_runs` (`supabase/migrations/0004_market_data_sync.sql:55-66`) tiene RLS activo sin policies para `anon` ni `authenticated`: solo `service_role` lee/escribe. La tabla es útil para debugging pero **no es segura de exponer tal cual** porque revelaría qué símbolos sincroniza el sistema. Hasta hoy nadie la consulta desde el cliente; el dashboard no sabe nada de ella.

El plan es: (1) añadir un segundo provider detrás del mismo interfaz con fallback automático; (2) derivar la "salud del sync" de `market_sync_runs` server-side y exponerla agregada al cliente vía un endpoint nuevo; (3) enriquecer el banner para que deje de ser opaco; (4) decidir cuándo se muestra el banner en función del **impacto real** sobre el portafolio del usuario, no de cualquier fallo en el batch.

## Goals / Non-Goals

**Goals:**
- Reducir la frecuencia con la que aparece el banner "Precio desactualizado" añadiendo un fallback gratuito (Stooq) que rellena cuando Yahoo falla.
- Hacer que el banner, cuando aparezca, **informe al usuario en español**: tiempo relativo de la última sync, próxima estimada, razón de la obsolescencia.
- Mostrar el banner solo cuando hay impacto real: o bien al menos un activo del portafolio del usuario está stale/estimated, o bien el último run del sync falló en su totalidad. **Nunca** por un fallo aislado en un símbolo que el usuario no tiene.
- Mantener `market_sync_runs` privado: el cliente consume agregados vía `/api/v1/market-data/sync-status`, que filtra campos y nunca enumera símbolos.
- Mantener el composite detrás del mismo `PriceProvider` para que el resto del código (read path, dashboard, trade form) no cambie.
- Mantener `$0/mes`: Stooq no requiere API key y el composite añade como mucho 1 call extra por símbolo; consumo Edge Function sigue dentro del free tier (500K/mes).

**Non-Goals (este change):**
- Crypto (CoinGecko, Trii cripto). Stooq no se usa para tickers cripto.
- Backoff exponencial o reintentos múltiples por provider.
- UI admin para editar `assets.yahoo_symbol` / `assets.stooq_symbol` (queda para 5.1).
- Relajar `delayed_until` (sigue 15 min, es throttle por símbolo).
- Relajar la cadencia del cron (sigue 30 min — ya cubre el `STALE_PRICE_MS = 2 h` con margen).
- Caché adicional de respuestas del provider más allá de `market_prices`.
- Cambiar el umbral `STALE_PRICE_MS`.
- Auto-discovery de símbolos en Stooq (cada activo declara su `stooq_symbol` explícitamente, mismo modelo que `yahoo_symbol`).

## Decisions

### D1. Composite como wrapper, no como provider nuevo

- **Choice**: `createCompositeProvider([yahoo, stooq])` implementa la misma interfaz `PriceProvider` (`src/lib/market-data/types.ts:44-47`). El registry (`src/lib/market-data/registry.ts`) devuelve el composite por defecto; el resto del código no sabe que hay dos providers.
- **Rationale**: Mantiene la arquitectura existente. El composite es transparente para `sync-prices`, el dashboard y el trade form. Si mañana añadimos un tercer provider (Alpha Vantage, etc.) es un cambio local.
- **Alternatives**: (a) Re-introducir una lógica de "providers[]" con orden de fallback en el registry — más general pero más complejo. (b) Hacer un hybrid provider que internamente decida — es esencialmente lo mismo, sin la indirección.

### D2. Yahoo primero, Stooq como fallback

- **Choice**: El composite intenta Yahoo; si Yahoo devuelve `RATE_LIMITED`, `TRANSIENT` o `PERMANENT`, llama a Stooq. Si Stooq también falla, el símbolo se registra como fallido en `market_sync_runs.error` y el batch continúa.
- **Rationale**: Yahoo es el provider primario conocido y la columna `yahoo_symbol` ya existe. Stooq entra como red de seguridad, no como reemplazo. Yahoo y Stooq pueden diferir ligeramente en precio (intradía con delay distinto); usar el primero que responde es más predecible que promediar.
- **Alternatives**: (a) Intercalar llamadas (Yahoo para N símbolos, Stooq para M) — over-engineering, ambos providers devuelven datos delayed. (b) Promediar precios — confuso para el usuario, divergencias en precio son normales y promediar introduce un precio "sintético" que no existe en ningún exchange.

### D3. La fuente efectiva se persiste en `market_prices.source`

- **Choice**: La columna `market_prices.source` (`supabase/migrations/0004_market_data_sync.sql`) admite hoy `'YAHOO' | 'BENCHMARK'`. La migración `0006_market_prices_source.sql` amplía el CHECK para añadir `'STOOQ'`. La Edge Function escribe el provider que efectivamente respondió.
- **Rationale**: Visibilidad para debugging y para el tooltip del glyph `⏱` (mostrar "Fuente: Yahoo · 14 jun 18:32" o "Fuente: Stooq"). Sin esta información el usuario no puede entender de dónde viene el dato.
- **Alternatives**: (a) Añadir columna `provider` separada — duplica info, peor para queries. (b) No persistir la fuente — el tooltip queda genérico ("fuente desconocida") y se pierde valor de debugging.

### D4. `market_sync_runs` se mantiene service-role-only

- **Choice**: La política de RLS no cambia. El nuevo endpoint `/api/v1/market-data/sync-status` corre en una Route Handler server-side, usa `createServiceSupabaseClient()` para leer la tabla, y devuelve un payload reducido con solo agregados (`lastSuccessAt`, `lastAttemptAt`, `nextRunEstimate`, `failedAssetCount`, `lastFailureReason`).
- **Rationale**: Mantener privacidad. La tabla contiene `error` con la lista de símbolos que fallaron; exponer eso revelaría qué activos se sincronizan (información que ya está protegida por RLS en `trades`). El endpoint público agrega la lista en un contador y categoriza la razón en un enum cerrado.
- **Alternatives**: (a) Relajar RLS para que el cliente lea `market_sync_runs` directamente — riesgo de privacidad, descarta. (b) Cachear la última fila de `market_sync_runs` en una tabla pública con solo los agregados — overhead innecesario, el endpoint computa el agregado en una query simple.

### D5. "Impacto real" como política de visibilidad del banner

- **Choice**: El banner se muestra si y solo si se cumple **alguna** de estas:
  1. `isAnyStale || isAnyEstimated` en el snapshot del portafolio del usuario (mismo criterio que ya existe).
  2. El último `market_sync_runs` (`kind = 'PRICES'`) tiene `status = 'FAILED'` **y** la última fila `market_prices` para al menos un activo del portafolio del usuario es más vieja que el último run exitoso (es decir, el run fallido dejó al usuario sin dato fresco).
  
  El banner **no** se muestra cuando el último run tuvo `failedAssetCount > 0` pero el resto del portafolio del usuario tiene cotizaciones fresh — el fallo es ajeno al usuario.
- **Rationale**: El usuario no debe ver una alerta por problemas que no le afectan. Un símbolo 404 que nadie tiene en su portafolio no es motivo de banner.
- **Alternatives**: (a) Mostrar el banner ante cualquier fallo — alarmismo innecesario. (b) Mostrar un banner secundario aparte con "X símbolos fallaron en el último sync" — futuro, no en este change.

### D6. `nextRunEstimate` como dato derivado, no como configuración

- **Choice**: El campo `nextRunEstimate` se calcula server-side como `lastAttemptAt + 30 min` (la cadencia del cron `*/30 * * * *` es pública en `supabase/migrations/0004_market_data_sync.sql:148`). Se redondea a la próxima media hora si la última attempt no fue exactamente al borde.
- **Rationale**: Evita acoplar el cliente a la cadencia del cron. Si en el futuro la cadencia cambia, solo cambia el cálculo server-side.
- **Alternatives**: (a) Devolver la cadencia como constante del cliente — acoplamiento. (b) No mostrarlo — pierde valor para el usuario ("¿cuándo se reintenta?").

### D7. Razón de la obsolescencia categorizada, no literal

- **Choice**: El campo `lastFailureReason` en la respuesta del endpoint es un enum cerrado:
  - `MARKET_CLOSED`: el último run fue `SUCCESS` pero todas las cotizaciones nuevas vinieron con `regularMarketPrice === null` (mercado cerrado).
  - `UPSTREAM_NULL`: el último run fue `SUCCESS` pero al menos un símbolo del portafolio del usuario no devolvió precio.
  - `RATE_LIMITED`: el último run tuvo `failedAssetCount > 0` con código de error `RATE_LIMITED` (puede estar mitigado por el composite si Stooq rellenó).
  - `NETWORK_ERROR`: el último run tuvo `failedAssetCount > 0` con `TRANSIENT` o `PERMANENT`.
  - `PARTIAL_FAILURE`: el último run fue `SUCCESS` pero `failedAssetCount > 0` para símbolos del portafolio del usuario.
  - `TOTAL_FAILURE`: el último run fue `FAILED` completo.
  - `NONE`: todo fresco y el run fue `SUCCESS` sin fallos.
  
  El cliente mapea el enum a un string en español desde `src/lib/i18n/dashboard.ts`.
- **Rationale**: Evita filtrar literales del `error` de `market_sync_runs` (que pueden contener URLs, IDs de símbolos, mensajes en inglés). Categorizar en cliente da control sobre el copy.
- **Alternatives**: (a) Devolver el `error` literal — filtra info, descarta. (b) No categorizar — el copy del banner queda vago.

### D8. `formatRelativeEs` como helper puro, no librería nueva

- **Choice**: Nuevo `src/lib/i18n/dates.ts` con la función `formatRelativeEs(iso: string, now?: Date): string` que usa `Intl.RelativeTimeFormat('es-CO')`. Sin dependencias nuevas.
- **Rationale**: `Intl.RelativeTimeFormat` está en Node 20 y en todos los navegadores modernos. Soporta "hace 5 min", "hace 2 h", "ayer". Para fechas más viejas cae a un formato absoluto corto ("14 jun 18:32").
- **Alternatives**: (a) Usar `dayjs` o `date-fns` — overhead, ya hay `Intl`. (b) Implementar un helper a mano — innecesario, `Intl` lo hace.

## Risks / Trade-offs

- **[Risk] Stooq cambia el formato CSV** → Mitigation: Zod schema explícito en `src/lib/market-data/stooq.ts` valida la respuesta; un cambio de formato rompe los tests unitarios y el composite devuelve `INVALID_PAYLOAD`. Si Stooq deja de funcionar, el composite cae a Yahoo solo (degradación elegante — el resto del sistema sigue funcionando como antes de este change).
- **[Risk] Yahoo y Stooq divergen en precio** → Mitigation: documentado en D2; el composite usa el primero que responde. El tooltip del glyph `⏱` muestra la fuente para que el usuario pueda hacer su propio juicio. No se promedia.
- **[Risk] Coste Edge Function se duplica en el peor caso** → Mitigation: el composite añade a lo sumo 1 call por símbolo cuando Yahoo falla. En el peor caso (todo Yahoo caído) pasamos de ~43K a ~86K invocaciones/mes. Sigue dentro del free tier (500K/mes). Documentado en la sección Costos del proposal.
- **[Risk] El endpoint `/sync-status` revela info del portafolio del usuario** → Mitigation: el endpoint devuelve solo agregados del último run global (no per-portfolio). El `failedAssetCount` es global, no per-usuario. La razón categorizada tampoco filtra símbolos. La privacidad por portafolio sigue garantizada por las RLS de `trades` y `portfolio_members`.
- **[Risk] El cliente asume la cadencia del cron** → Mitigation: la cadencia está centralizada en el cálculo server-side (`lastAttemptAt + 30 min`), no en el cliente. Si la cadencia cambia, el cálculo cambia; el cliente no se entera.
- **[Risk] `market_prices.source` es enum en la DB pero el cliente asume tipos** → Mitigation: la nueva validación Zod en `src/lib/validations/dashboard.ts` y el `CHECK` de Postgres se mantienen en sync. Si alguien añade un valor nuevo, ambos lados rompen a la vez.
- **[Risk] Mostrar "Sincronización en cola" cuando no es cierto** → Mitigation: `nextRunEstimate` se calcula honestamente desde `lastAttemptAt`. Si el último run fue hace 28 min, dice "próxima sync en ~2 min". Si el último run fue hace 5 min, dice "próxima sync en ~25 min". No se simula una promesa que el cron no puede cumplir.
- **[Trade-off] El banner es más largo ahora** → Acceptable: la información extra (tiempo relativo, razón) es exactamente lo que el usuario pidió. El copy es compacto (3 líneas máx). Tono ámbar/naranja sigue distinguiendo "stale" de "estimated" y de "fresh".
- **[Trade-off] Stooq no documenta API** → Documentado; Stooq es un sitio público con scraping-friendly CSV. Si en el futuro cierra el endpoint, el composite degrada a Yahoo solo sin cambios fuera de `stooq.ts`.

## Migration Plan

1. Crear la rama de feature y aterrizar este change siguiendo `openspec apply` (las tareas ya están definidas en `tasks.md`).
2. Antes de mergear: `pnpm lint && pnpm test:run` debe pasar; los tests unitarios nuevos del composite y Stooq deben correr contra fixtures grabados.
3. Antes de mergear: `pnpm build` debe pasar (la build de Next es el typecheck de facto según AGENTS.md).
4. Deploy de la Edge Function actualizada:
   ```bash
   supabase functions deploy sync-prices
   ```
5. Aplicar la migración nueva contra el proyecto:
   ```bash
   supabase db push  # aplica 0006_market_prices_source.sql
   ```
6. Verificar post-deploy:
   - `select source, count(*) from market_prices group by source;` debe mostrar las tres fuentes en uso.
   - `GET /api/v1/market-data/sync-status` debe devolver el nuevo payload con todos los campos.
   - Visitar el dashboard, simular un dato viejo (insertar manualmente una fila con `observed_at` de hace 3 h), refrescar — el banner debe mostrar "Última actualización: hace 3 h" y la razón categorizada.
7. Rollout feature flag: no es necesario; el banner enriquecido es backward-compatible (los campos nuevos son opcionales en la respuesta, los componentes existentes los ignoran si faltan).
8. Rollback: si Stooq causa problemas, basta con quitar `stooq` del array en `createCompositeProvider([yahoo])` y re-deployar la Edge Function. La migración del CHECK es aditiva (no rompe filas existentes) y se puede dejar.

## Open Questions

- **Q1**: ¿Queremos un segundo mecanismo de fallback además de Stooq (p. ej. cachear la última cotización buena durante N días y servirla si ambos providers caen)? → Queda para 5.1; este change es solo el composite Stooq.
- **Q2**: ¿El campo `nextRunEstimate` debe ser absoluto (timestamp) o relativo ("en ~25 min")? → Decisión D8: server-side devuelve ISO, cliente formatea con `formatRelativeEs`. Si el usuario quiere absoluto en algún sitio (p. ej. tooltip), el campo ya está disponible.
- **Q3**: ¿La razón `PARTIAL_FAILURE` debe distinguir "del portafolio del usuario" vs "de otros portafolios"? → Decisión D5: el banner solo se activa si el partial failure toca al portafolio del usuario. El endpoint devuelve el contador global y la razón global; el cliente decide si mostrar o no el banner.
