## Why

El dashboard, la lista de operaciones y la página avanzada se renderizan en el cliente: el HTML del servidor solo contiene un texto "Cargando…" y el contenido real aparece tras 4–5 `fetch()` que vuelven a ejecutar las mismas queries de Supabase (~16–20 round-trips por carga). No existe caché en ningún lado (un único `Cache-Control` en toda la app), el `commit` del importador CSV hace ~2 llamadas por fila (N+1), `loadLatestMarketPrices` sobre-fetcha todo el historial de precios sin `LIMIT` por asset, y faltan índices en columnas filtradas por la lista de trades. El LCP móvil en 3G se estima en 2–4 s a contenido real. El objetivo: bajar los round-trips del dashboard de ~18 a ~4, servir datos en el HTML inicial, y acotar el costo del importador CSV.

## What Changes

- **Dashboard migrado a Server Components con carga agregada**: `src/app/page.tsx` (y `/avanzado`) se vuelven componentes servidor async que llaman a una nueva función `loadDashboardAggregate()` que ejecuta `loadDashboardData` **una sola vez** y computa summary + evolution + returns + snapshot en proceso. El HTML llega con datos reales. `SummaryCards` pierde `"use client"` (es puramente presentacional) para SSR. Los charts de `recharts` se mantienen como `next/dynamic` ssr:false.
- **Nuevo endpoint agregado `GET /api/v1/dashboard/aggregate`** que devuelve los 4 payloads en una respuesta, usado por el `reload()` cliente (1 fetch vs 4). Los 4 route handlers actuales quedan deprecated pero funcionales.
- **Caché con invalidación**: `unstable_cache` envuelve `loadLatestMarketPrices` y `loadBenchmarkSeries` (asset-scoped, cacheable) con TTL 60 s y tags `market-prices` / `benchmark`. `revalidateTag` tras los cron de sync. `revalidatePath("/")` y `revalidatePath("/avanzado")` tras mutaciones de trades y `csv commit`. `Cache-Control: private, s-maxage=30, stale-while-revalidate=60` en el endpoint agregado.
- **`loadLatestMarketPrices` optimizado**: reemplazo del fetch de todo el historial por una función SQL `get_latest_market_prices(p_asset_ids uuid[])` con `DISTINCT ON (asset_id)` que aprovecha el índice `market_prices_asset_id_observed_at_idx`. Trae 1 fila por asset en lugar de cientos.
- **CSV commit batcheado**: `src/app/api/v1/imports/csv/commit/route.ts` deja de hacer re-lookup de asset por fila (reutiliza el mapa ya cargado en preview), inserta assets nuevos en un solo `insert([...])` y todos los trades válidos en un solo `insert([...])`. ~1000 round-trips → ~3 para 500 filas.
- **Nueva migración `0007_performance_indexes.sql`** (0001 es inmutable) con índices en `trades(broker_id)`, `trades(trade_type)`, `trades(currency_original)`, `csv_import_rows(import_id, validation_status)` y la función `get_latest_market_prices`. RLS intacta; el test de schema PGlite debe pasar.

## Capabilities

### New Capabilities
- `dashboard-server-loading`: Carga del dashboard renderizada en servidor en una sola pasada, con caché de datos de mercado/benchmark y invalidación por ruta tras mutaciones de trades e imports.
- `csv-import-batching`: El commit del importador CSV persiste assets nuevos y trades en operaciones batch en lugar de una inserción por fila.
- `market-prices-latest-query`: Accesor SQL eficiente (`get_latest_market_prices`) que devuelve la fila más reciente por asset usando `DISTINCT ON`, reemplazando el sobre-fetch del historial completo.
- `performance-database-indexes`: Índices requeridos en columnas de `trades` y `csv_import_rows` usadas como filtros/joins frecuentes.

### Modified Capabilities
<!-- Ninguna. Los contratos observable de `market-data-ui` (snapshot endpoint, staleness badges, benchmark chart, trade-form COP pre-fill) no cambian. Las capabilities de dashboard de phase-3 (dashboard-summary, dashboard-api, portfolio-*) aún no están archivadas en openspec/specs/, por lo que se tratan como nuevas o implícitas, no como modificadas. -->

## Impact

- **Código afectado**: `src/app/page.tsx`, `src/app/avanzado/page.tsx`, `src/features/dashboard/dashboard-page-client.tsx`, `src/features/avanzado/avanzado-page-client.tsx`, `src/features/dashboard/use-dashboard-data.ts`, `src/features/avanzado/use-advanced-data.ts`, `src/components/charts/summary-cards.tsx`, `src/lib/dashboard/loader.ts`, `src/lib/dashboard/snapshot.ts`, nuevo `src/lib/dashboard/aggregate.ts`, nuevo `src/app/api/v1/dashboard/aggregate/route.ts`, `src/app/api/v1/trades/route.ts` (invalidación), `src/app/api/v1/imports/csv/commit/route.ts` (batch), `supabase/migrations/0007_performance_indexes.sql`, `supabase/functions/sync-prices/` y `sync-fx-rates/` (revalidateTag), `next.config.ts` (sin cambios requeridos para este alcance).
- **APIs**: nuevo `GET /api/v1/dashboard/aggregate`; los 4 endpoints existentes se marcan deprecated (no se eliminan, se mantienen para compatibilidad).
- **Dependencias**: sin cambios en `package.json` (no se añade `@tanstack/react-query` pese a estar listado; se reutilizan hooks existentes). `unstable_cache` es de React/Next, ya disponible.
- **Sistemas**: Supabase Postgres (nueva función + índices), Edge Functions de sync (añaden `revalidateTag` vía HTTP a la app o equivalente), Vercel (caché `s-maxage` en CDN respetando cookies de auth).
- **Riesgo**: la migración con PL/pgSQL debe pasar el test de schema en PGlite (`src/supabase/migrations/schema.test.ts`); si PGlite no soporta `DISTINCT ON` en una función, se documentará un fallback cliente con `limit` por asset. El `unstable_cache` para datos asset-scoped requiere que la key no incluya el `portfolio_id` (los precios son globales), validado en design.
