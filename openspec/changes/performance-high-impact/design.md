## Context

La app renderiza el dashboard, `/trades` y `/avanzado` solo en cliente: el server component page no hace fetch y delega a un `"use client"` que dispara 4–5 `fetch()` en `useEffect`. Cada route handler (`/api/v1/dashboard/{summary,evolution,returns,snapshot,distribution}`) llama de forma independiente a `loadDashboardData` (loader.ts:141), que hace 2 queries de Supabase (trades+joins, y market_prices). Aunque `loadDashboardData` usa `cache()` de React, este dedupe es **por request HTTP**, y los 4–5 fetch del cliente son requests distintos → las queries se ejecutan 4–5 veces por carga. Sumando `requireApiUser` + `getCurrentPortfolio` por endpoint (~2 round-trips c/u), una carga del dashboard genera ~16–20 round-trips a Supabase. El HTML servido contiene únicamente "Cargando dashboard…", por lo que el LCP móvil en 3G se estima en 2–4 s hasta contenido real.

No existe caché de ningún tipo (un único `Cache-Control` en `fx/latest`, además inefectivo por leer cookies). El cron `sync-prices` (0004_market_data_sync.sql:148-158) corre cada 30 min, pero cada carga recomputa todo. `loadLatestMarketPrices` (loader.ts:114-118) trae **todo** el historial de `market_prices` por asset y dedupe en JS — cientos de filas para traer 1 por asset. El `csv commit` (commit/route.ts:141-228) hace ~2 round-trips por fila (re-lookup de asset + insert de trade), ~1000 para 500 filas. Faltan índices en `trades(broker_id)`, `trades(trade_type)`, `trades(currency_original)` y `csv_import_rows(import_id, validation_status)`.

Restricciones del repo: Vercel Hobby + Supabase Free (USD 0/mes), no añadir servicios pagos; 0001_foundation.sql es inmutable; toda mutación server-side via Route Handlers con `createUserSupabaseClient()` (sujeto a RLS); UI en español; `pnpm`.

## Goals / Non-Goals

**Goals:**
- Servir el HTML del dashboard y de `/avanzado` con datos reales (LCP = contenido, no loader).
- Reducir los round-trips de Supabase por carga de dashboard de ~18 a ≤5.
- Introducir caché de datos de mercado/benchmark (asset-scoped) con invalidación tras sync y mutaciones.
- Eliminar el sobre-fetch de `market_prices` (1 fila por asset).
- Batchear el `csv commit` a ~3 operaciones para 500 filas.
- Añadir índices en columnas filtradas sin romper RLS ni el test de schema PGlite.

**Non-Goals:**
- Deduplicación de auth (middleware + requireApiUser + MainNavigation client `getUser`) — fuera de este alcance.
- Convertir `MainNavigation` en server island.
- Añadir `loading.tsx`/`error.tsx`/`not-found.tsx`.
- Arreglar el refetch de FX por tecla en `trade-form.tsx`.
- Limpieza de `next.config.ts` (`removeConsole`, `optimizeCss`, `serverExternalPackages`) y remoción de `@tanstack/react-query` muerta.
- Pruebas de rendimiento/Lighthouse CI/reporting web-vitals.
- Virtualización de la tabla de preview del importador.
- Migrar la lista `/trades` a server rendering (solo dashboard + avanzado).

## Decisions

### 1. Server Component con carga agregada en servidor (vs. caché sobre los 4 endpoints existentes)
**Decisión:** `src/app/page.tsx` y `src/app/avanzado/page.tsx` se vuelven async server components que llaman a `loadDashboardAggregate()` (nuevo, en `src/lib/dashboard/aggregate.ts`). Esta función invoca `loadDashboardData` **una sola vez** y reutiliza las funciones de cálculo existentes (`aggregateHoldings`, `calculateTotalEquity`, `calculatePortfolioPnl`, `computeAssetStaleness`, series de evolución, returns anuales, snapshot) para producir los 4 payloads en memoria, pasándolos como props a un componente presentacional.

**Por qué no solo caché sobre la API existente:** mejoraría el coste de cómputo pero el HTML seguiría sin datos (LCP sigue siendo el loader) y el waterfall cliente de 4 fetch seguiría existiendo. El SC elimina ambos de raíz.

**Alternativa considerada:** mantener los 4 endpoints y paralelizar con `Promise.all` en el server component — descartada porque cada uno re-ejecuta auth+portfolio+loadDashboardData (más round-trips) y obliga a 4 serializaciones JSON; la agregación en proceso es más barata y atómica.

### 2. Nuevo endpoint agregado `GET /api/v1/dashboard/aggregate` (deprecando los 4)
**Decisión:** Crear `/api/v1/dashboard/aggregate` que devuelve `{ summary, evolution, returns, snapshot }` (o `{ snapshot }` para avanzado) en una sola respuesta. El hook cliente `useDashboardData`/`useAdvancedData` pasa de 4–5 `fetch` a 1. Los 4–5 endpoints actuales **no se eliminan** (se marcan deprecated en comentarios) para no romper posibles consumidores ni E2E; se reutilizan internamente solo si se necesitan.

**Alternativa considerada:** eliminar los 4 endpoints — descartada por riesgo de regresión y por mantener compatibilidad con tests existentes.

### 3. Caché en dos capas: `unstable_cache` (datos asset-scoped) + `Cache-Control` (endpoint agregado)
**Decisión:**
- `loadLatestMarketPrices` y `loadBenchmarkSeries` se envuelven con `unstable_cache`, key = hash de `assetIds` ordenados (los precios son **globales**, no por portfolio, así que la key NO incluye `portfolioId` — esto es seguro bajo RLS porque estos datos no son sensibles por usuario). TTL 60 s, tags `["market-prices"]` / `["benchmark"]`.
- El endpoint `/api/v1/dashboard/aggregate` emite `Cache-Control: private, s-maxage=30, stale-while-revalidate=60` para el `reload()` cliente y CDN edge (Vercel respeta `private` para no cachear entre usuarios).

**Por qué `unstable_cache` y no solo `Cache-Control`:** el SC no pasa por HTTP, así que la caché de CDN no le aplica; `unstable_cache` cachéa el resultado de la función entre requests del servidor. El `Cache-Control` cubre el path cliente (`reload`).

**Riesgo de seguridad:** confirmar que `market_prices` y `benchmark` no tienen RLS que filtre por usuario (son datos de mercado globales) → si los tuvieran, la caché cruzaría usuarios. La decision asume que NO hay RLS user-scoped en esas tablas; se valida en tasks antes de aplicar.

### 4. Invalidación: `revalidatePath` para mutaciones de trades/imports + `revalidateTag` para sync
**Decisión:**
- Tras `trades POST/PATCH/DELETE` (`trades/route.ts`, `trades/[id]/route.ts`) y `csv commit` (`commit/route.ts`): `revalidatePath("/")` y `revalidatePath("/avanzado")`. Path-based es simple y suficiente porque cada usuario solo ve su propio dashboard (no hay URLs por portfolio).
- Tras `sync-prices` y `sync-fx-rates` (Edge Functions): `revalidateTag("market-prices")` y `revalidateTag("benchmark")`. Como las Edge Functions corren en Deno (fuera de la app Next), la invalidación se hace vía HTTP interno (un route handler `POST /api/v1/admin/cache/invalidate` con un token compartido) o documentando que el tag se invalida en la próxima mutación de trade. Se elige el route handler interno por simplicidad operativa.

**Alternativa considerada:** `revalidateTag` para todo (incluido trades) con tag por portfolio — descartada porque requiere gestionar tags dinámicos por portfolio y el path-based es suficiente para el scope.

### 5. Función SQL `get_latest_market_prices` con `DISTINCT ON` (vs. `limit` por asset en cliente)
**Decisión:** Nueva función PL/pgSQL en `0007_performance_indexes.sql`:
```sql
CREATE OR REPLACE FUNCTION get_latest_market_prices(p_asset_ids uuid[])
RETURNS SETOF market_prices LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (asset_id) *
  FROM market_prices
  WHERE asset_id = ANY(p_asset_ids)
    AND (delayed_until IS NULL OR delayed_until <= now())
  ORDER BY asset_id, observed_at DESC;
$$;
```
`loadLatestMarketPrices` la invoca vía `.rpc("get_latest_market_prices", { p_asset_ids: assetIds })`. Trae exactamente 1 fila por asset usando el índice `market_prices_asset_id_observed_at_idx`.

**Alternativa considerada:** un `fetch` por asset con `.eq().limit(1)` en bucle — N round-trips, descartada. O un `select().in().order().limit(N)` global — no garantiza 1 por asset.

**Riesgo PGlite:** el test de schema (`src/supabase/migrations/schema.test.ts`) aplica el DDL a PGlite. Si PGlite no soporta `DISTINCT ON` dentro de una función `LANGUAGE sql`, el test falla. **Mitigación:** validar primero; si falla, fallback a la query actual con un `limit` global grande + dedupe JS (no óptimo pero no bloqueante), y dejar la función SQL para producción Supabase. El fallback se documenta en tasks.

### 6. CSV commit: reutilizar mapa de assets de preview + inserts batch
**Decisión:**
- Reutilizar el mapa de assets existentes ya cargado en la fase preview (commit/route.ts:91-99, `existingTickers`/`profileByTicker`) en lugar del re-lookup por fila (líneas 147-152).
- Insertar assets nuevos en un solo `supabase.from("assets").insert([...]).select("id, ticker")` y construir un `Map<ticker, id>` con el resultado.
- Construir el array de trades válidos (con `normalizeTradeUsdValues` aplicado) e insertarlos en un solo `supabase.from("trades").insert([...])`.
- Recolectar errores por fila (filas cuyo asset falló o que no validan) en el array `errors` existente, sin abortar el batch.

**Alternativa considerada:** una RPC transaccional `commit_csv_import(p_import_id)` en Postgres — más segura (atomicidad) pero requiere serializar la lógica de `normalizeTradeUsdValues` (TypeScript) en PL/pgSQL, rompiendo el single-source-of-truth de las validaciones. Descartada por complejidad y riesgo de divergencia.

**Trade-off atomicidad:** el batch insert de Supabase no es transaccional a nivel de "todas o ninguna" vía el cliente JS por defecto; si falla una fila del array, Postgres rechaza todo el array (good — atomicidad) o inserta las válidas según configuración. Se asume comportamiento estándar de PostgREST (falla todo el array si una viola constraint). Para no perder filas válidas por una inválida, se particiona el insert en chunks válidos y se aíslan las filas problemáticas en `errors`.

### 7. `SummaryCards` pierde `"use client"`
**Decisión:** `src/components/charts/summary-cards.tsx` es puramente presentacional (sin hooks/state/handlers confirmado en exploración). Quitar `"use client"` permite SSR y reduce el client bundle. Si tras el análisis resulta que usa algún hook, se mantiene client y se documenta.

## Risks / Trade-offs

- **[Riesgo] `unstable_cache` cruza usuarios si `market_prices`/benchmark tuvieran RLS por usuario** → Mitigación: validar RLS de esas tablas en 0001/0003 antes de aplicar; los datos de mercado son globales por diseño, pero se confirma. Si tuvieran RLS, no cachear y dejar solo `Cache-Control private`.
- **[Riesgo] PGlite no soporta `DISTINCT ON` en función SQL** → Mitigación: fallback a query cliente con dedupe JS (decisión 5). El test de schema debe pasar en CI sin Supabase.
- **[Riesgo] `revalidatePath` invalida para todos los usuarios** → No aplica: cada path es el mismo (`/`) pero el contenido es por usuario vía cookies/session; `revalidatePath` purga la caché de la ruta (no cachea HTML entre usuarios en server components dinámicos por cookie). Aceptable.
- **[Riesgo] Batch insert pierde granularidad de errores por fila** → Mitigación: pre-validar filas antes del batch; aislar las inválidas en `errors`; insertar en chunks. Se mantiene el contrato observable del response (contador + array de errores).
- **[Riesgo] Edge Functions Deno no pueden llamar `revalidateTag` directamente** → Mitigación: route handler interno `POST /api/v1/admin/cache/invalidate` con token compartido vía env; o aceptar invalidación "lazy" en la próxima mutación de trade. Se implementa el route handler.
- **[Trade-off] Los 4 endpoints de dashboard quedan deprecated** → Mantenimiento de código duplicado temporal; se eliminan en un cambio futuro una vez confirmado que nada los consume.
- **[Trade-off] `loadDashboardAggregate` acopla los 4 cálculos en una función** → Aumenta complejidad de esa función, pero centraliza y permite reusar `holdings` computado una vez (hoy se recomputa en cada endpoint).

## Migration Plan

1. **Migración DB primero:** crear `0007_performance_indexes.sql` con índices + función `get_latest_market_prices`. Aplicar en Supabase (QA/prod). Ejecutar `pnpm test:run` (incluye schema test PGlite) — debe pasar.
2. **`market_prices` query (decision 5):** modificar `loadLatestMarketPrices` para usar `.rpc(...)`. Verificar respuesta en dev. Si PGlite falla, aplicar fallback.
3. **Caché `unstable_cache` (decision 3):** envolver `loadLatestMarketPrices` y `loadBenchmarkSeries`. Validar RLS de las tablas.
4. **Aggregate + endpoint (decisions 1, 2):** crear `aggregate.ts` + `/api/v1/dashboard/aggregate/route.ts`. Tests unitarios del agregador (reusar fixtures).
5. **Server components (decision 1):** migrar `page.tsx` y `avanzado/page.tsx`. `SummaryCards` pierde `"use client"` (decision 7). Hooks cliente usan el endpoint agregado para `reload`.
6. **Invalidación (decision 4):** añadir `revalidatePath` en mutaciones de trades y commit; route handler de invalidación de tags.
7. **CSV batch (decision 6):** refactor de `commit/route.ts`.

**Rollback:** cada paso es independiente. Si la migración SQL causa regresión, revertir 0007 (los índices son aditivos, la función es `CREATE OR REPLACE` — seguro). Si el SC causa issues, volver a renderizar `<DashboardPageClient />` sin props (vuelve al flujo cliente). Los endpoints antiguos siguen funcionando.

## Open Questions

- ¿`market_prices` y la tabla/series de benchmark tienen RLS con policies que filten por `auth.uid()`? Si sí, el `unstable_cache` asset-scoped no es seguro y se debe limitar a `Cache-Control private` únicamente. (A resolver en tasks antes de aplicar la decision 3.)
- ¿PGlite soporta `DISTINCT ON` dentro de `LANGUAGE sql` functions? (A verificar con el test de schema; si no, fallback de la decision 5.)
- ¿Conviene mantener los 4 endpoints deprecados indefinidamente o fijar una fecha de eliminación? (Post-implementación.)
