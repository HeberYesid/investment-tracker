## Why

El dashboard ya muestra el banner "Precio desactualizado" cuando una cotización tiene más de 2 h (`STALE_PRICE_MS`), pero **no dice cuándo se sincronizó por última vez, ni por qué está viejo, ni si el sistema de sync tiene un problema activo**. Eso convierte el banner en una alerta opaca: el usuario ve la advertencia sin contexto para decidir si confiar en el número o esperar. Adicionalmente, hoy hay un solo proveedor de precios (Yahoo Finance) detrás del `PriceProvider`: si Yahoo devuelve 429 o 5xx, no hay fallback, y la siguiente media hora el dashboard muestra el banner aunque el resto del pipeline esté sano. Este change cierra los dos huecos a la vez: añade un segundo proveedor gratuito (Stooq) detrás del mismo interfaz, y expone al usuario la salud real del sync de su portafolio (última corrida exitosa, próxima estimada, razón de la obsolescencia cuando aplique).

## What Changes

- Nuevo `PriceProvider` para Stooq (CSV público, sin API key) y un `CompositeProvider` que orquesta Yahoo → Stooq. La columna `market_prices.source` se amplía para registrar qué proveedor escribió la fila (`YAHOO` | `STOOQ` | `BENCHMARK`).
- Edge Function `sync-prices` consume el composite; los fallos de Yahoo caen automáticamente a Stooq sin abortar el batch.
- Nuevo endpoint `GET /api/v1/market-data/sync-status` (user-scoped, sin enumerar símbolos) que devuelve la salud agregada del último `market_sync_runs` del portafolio del usuario: `lastSuccessAt`, `lastAttemptAt`, `nextRunEstimate`, `failedAssetCount`, `lastFailureReason`.
- `SummaryResponse` y `SnapshotResponse` ganan un bloque `sync: SyncHealth` para que el cliente pinte el banner con datos reales.
- Banner de "Precio desactualizado" se enriquece: muestra tiempo relativo desde la última sync, próxima estimada, y razón de la obsolescencia ("Mercado cerrado", "Proveedor no devolvió precio", "Sincronización en cola"). Solo se muestra cuando hay impacto real sobre los precios del portafolio del usuario — nunca por un fallo aislado en un símbolo que el usuario no tiene.
- Nuevo helper de i18n `formatRelativeEs(iso, now)` en `src/lib/i18n/dates.ts` ("hace 5 min", "hace 2 h 14 min", "ayer 18:00").
- `DistributionChart`: el tooltip del glyph `⏱` muestra el timestamp absoluto y la fuente del dato (`Fuente: Yahoo · 14 jun 18:32`).
- Migración nueva `0006_market_prices_source.sql` que amplía el CHECK de `market_prices.source` para aceptar `'STOOQ'`. No se añade tabla nueva.
- `market_sync_runs` **sigue siendo service-role-only** (privacidad — no exponer qué símbolos sincroniza el sistema). La salud agregada que ve el usuario se sirve desde el nuevo endpoint, que lee de `market_sync_runs` con service role pero solo expone campos agregados.
- Crypto queda explícitamente fuera de este change (no se añade CoinGecko, Stooq no se usa para tickers cripto de Trii).

## Capabilities

### New Capabilities
- `market-data-resilience`: el sistema añade un segundo proveedor de precios (Stooq) detrás de un composite; cuando Yahoo falla por rate-limit, error transitorio o no-encontrado, el composite rellena desde Stooq. La fuente efectiva se persiste en `market_prices.source` y se expone al cliente.
- `market-data-sync-status`: el sistema expone al usuario autenticado la salud agregada del último sync de su portafolio a través de `GET /api/v1/market-data/sync-status`, sin enumerar símbolos individuales, derivado de las filas `market_sync_runs` (service-role-only) leídas server-side.

### Modified Capabilities
- `market-data-ui`: el banner "Precio desactualizado" deja de ser opaco — incluye tiempo relativo de la última sync, próxima estimada y razón de la obsolescencia; solo se muestra cuando hay impacto real sobre precios del portafolio del usuario. `SummaryResponse` y `SnapshotResponse` ganan un bloque `sync: SyncHealth`.
- `market-data-providers`: se añade el composite y Stooq como segundo proveedor; el registry expone una función `getPriceProvider()` que devuelve el composite por defecto. La forma de la respuesta de Stooq se valida con Zod igual que la de Yahoo.

## Impact

- **DB**: nueva migración `supabase/migrations/0006_market_prices_source.sql` que altera el CHECK de `market_prices.source` para añadir `'STOOQ'`. Smoke test PGlite debe seguir pasando (cambio aditivo, no destructivo).
- **Edge Function**: `supabase/functions/sync-prices/index.ts` sustituye el call directo a `fetchYahooQuote` por el composite. Lógica de fallback y log de métricas por proveedor en `market_sync_runs.error` (formato: `"stooq_fallback=N,yahoo_ok=M"`).
- **Lógica de mercado**: nuevos archivos `src/lib/market-data/stooq.ts` y `src/lib/market-data/composite.ts`. Ampliación de `src/lib/market-data/registry.ts` y `src/lib/market-data/config.ts` (User-Agent, timeout). Tests unitarios nuevos.
- **API**: nuevo `src/app/api/v1/market-data/sync-status/route.ts` (GET, user-scoped, lee `market_sync_runs` con service role y devuelve solo agregados). Costo cero en invocaciones Edge.
- **Lógica dashboard**: `src/lib/dashboard/snapshot.ts` añade `loadSyncHealth(supabase)`; el `dashboard/summary` route y `dashboard/snapshot` route incluyen el bloque `sync` en la respuesta.
- **Validations**: `src/lib/validations/dashboard.ts` añade `SyncHealthSchema` y lo incluye en `SummaryResponse` y `SnapshotResponse`. Cambia la forma del JSON de respuesta — los consumers existentes (SummaryCards, DistributionChart) son los únicos; los tests existentes se actualizan en este mismo change.
- **UI**: `src/components/charts/summary-cards.tsx` enriquece el banner; `src/components/charts/distribution-chart.tsx` amplía el tooltip del glyph `⏱`. Nuevo `src/lib/i18n/dates.ts` con `formatRelativeEs`. Strings nuevos en `src/lib/i18n/dashboard.ts`.
- **Dependencias**: ninguna nueva (Zod, dayjs/Intl ya disponibles). Stooq no requiere cliente.
- **Costos**: el composite añade como mucho 1 call HTTP extra por símbolo cuando Yahoo falla; en el peor caso (todo Yahoo caído) pasamos de ~43K a ~86K invocaciones Edge/mes. Sigue dentro del free tier (500K/mes).
- **Tests**: nuevos `tests/unit/market-data/stooq.test.ts` y `tests/unit/market-data/composite.test.ts`; ampliación de `tests/integration/dashboard/summary.test.ts`; nuevo `tests/unit/i18n/dates.test.ts`; E2E `tests/e2e/home.spec.ts` añade aserción del tiempo relativo en el banner cuando se simula un dato viejo.
- **Privacidad**: `market_sync_runs` no se relaja — sigue con RLS activo y solo `service_role` accede. El endpoint público `/sync-status` solo expone agregados (timestamps, contadores, razón categorizada) — nunca la lista de símbolos intentados.
- **Out of scope (no entra en este change)**:
  - Crypto (CoinGecko, Trii cripto) — queda para una fase posterior.
  - Backoff exponencial o múltiples reintentos dentro del Edge Function (sigue siendo 1 intento por provider).
  - UI admin para editar `assets.yahoo_symbol` o `assets.stooq_symbol` (queda para 5.1).
  - Caché adicional de respuestas del provider más allá de la tabla `market_prices`.
  - Relajar el `delayed_until` de 15 min (sigue igual; es la capa de throttle).
