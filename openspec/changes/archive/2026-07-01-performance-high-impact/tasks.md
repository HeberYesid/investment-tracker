## 1. Migración de base de datos (0007)

- [x] 1.1 Verificar el RLS actual de `market_prices` y de la tabla/series de benchmark en `supabase/migrations/0001_foundation.sql` y `0003_auth_and_permissions.sql` (resuelve la primera Open Question del design: ¿hay policies por `auth.uid()`?).
- [x] 1.2 Crear `supabase/migrations/0007_performance_indexes.sql` con `CREATE INDEX` en `trades(broker_id)`, `trades(trade_type)`, `trades(currency_original)` y `csv_import_rows(import_id, validation_status)`.
- [x] 1.3 Añadir al mismo `0007` la función `get_latest_market_prices(p_asset_ids uuid[])` con `DISTINCT ON (asset_id)` y filtro `delayed_until <= now()` (ver snippet del design, decisión 5).
- [x] 1.4 Ejecutar `pnpm test:run` y confirmar que el schema smoke test (PGlite) pasa. Si PGlite rechaza `DISTINCT ON` en `LANGUAGE sql`, implementar el fallback documentado (query cliente con dedupe JS) y anotarlo. (Ver `src/supabase/migrations/schema.test.ts` — los tests de `get_latest_market_prices` ya cubren DISTINCT ON + delayed + empty con PGlite. No hizo falta fallback.)
- [ ] 1.5 Aplicar la migración a Supabase local/QA y verificar con `EXPLAIN` que `GET /api/v1/trades?broker_id=...` usa el nuevo índice.

## 2. Accesor eficiente de market prices

- [x] 2.1 Modificar `loadLatestMarketPrices` en `src/lib/dashboard/loader.ts:109-139` para usar `supabase.rpc("get_latest_market_prices", { p_asset_ids: assetIds })` cuando `assetIds` no esté vacío (mantener el early-return en vacío).
- [x] 2.2 Mapear la respuesta del RPC al tipo `MarketPriceRow[]` existente (convertir `price_usd` con `Number()`, preservar `delayed_until`).
- [x] 2.3 Si se aplicó el fallback PGlite, mantener la rama JS detrás un guard y documentar por qué.
- [x] 2.4 Añadir/ajustar un test unitario en `tests/unit/dashboard/` (o co-local) que verifique que con N assets se obtiene a lo sumo 1 fila por asset (mock del RPC).

## 3. Caché `unstable_cache` (datos asset-scoped)

- [x] 3.1 Solo si la task 1.1 confirma que NO hay RLS por usuario en `market_prices`/benchmark: envolver `loadLatestMarketPrices` con `unstable_cache`, key `["market-prices", hashAssetIds(assetIds)]`, TTL 60s, tags `["market-prices"]`. La key NO incluye `portfolioId`.
- [x] 3.2 Envolver `loadBenchmarkSeries` en `src/lib/dashboard/snapshot.ts` con `unstable_cache`, key `["benchmark"]`, TTL 60s, tags `["benchmark"]`.
- [x] 3.3 Crear helper `hashAssetIds(ids: string[]): string` (ordenar + join + hash simple) en `src/lib/dashboard/cache-keys.ts`.
- [x] 3.4 Si la task 1.1 indica que SÍ hay RLS por usuario: NO aplicar `unstable_cache`; documentar la decisión y dejar solo `Cache-Control private` en el endpoint agregado (task 5.3).

## 4. Función agregadora en servidor

- [x] 4.1 Crear `src/lib/dashboard/aggregate.ts` con `loadDashboardAggregate(portfolioId, supabase)` que llame una sola vez a `loadDashboardData` y compute: `holdings = aggregateHoldings(...)`, luego summary (`calculateTotalEquity`, `calculatePortfolioPnl`, `computeAssetStaleness`), evolution, returns y snapshot, reutilizando las funciones existentes y el mismo `holdings`.
- [x] 4.2 Definir el tipo de retorno `DashboardAggregate` que combine `SummaryResponse`, `EvolutionResponse`, `ReturnsResponse`, `SnapshotResponse`.
- [x] 4.3 Asegurar que el cálculo de staleness se haga una sola vez (fix del bug O(holdings×assets) en `distribution/route.ts:45-56` se traslada aquí: computar `activeAssetIds` y `staleness` fuera del bucle).
- [x] 4.4 Añadir test unitario del agregador con fixtures de trades/precios que valide que `holdings` se computa una sola vez (spy/mocks).

## 5. Endpoint agregado + caché HTTP

- [x] 5.1 Crear `src/app/api/v1/dashboard/aggregate/route.ts` con `GET` que use `requireApiUser` + `getCurrentPortfolio` + `loadDashboardAggregate` y devuelva `{ summary, evolution, returns, snapshot }`.
- [x] 5.2 Soportar query param `scope=advanced` (o un segundo endpoint `/avanzado` si es más limpio) para devolver solo el `snapshot` usado por `/avanzado`, evitando cómputo innecesario.
- [x] 5.3 Añadir `Cache-Control: private, s-maxage=30, stale-while-revalidate=60` a la respuesta del aggregate.
- [x] 5.4 Marcar los 4 endpoints legacy (`summary`, `evolution`, `returns`, `snapshot`) como deprecated vía comentario en el header de cada `route.ts` (no eliminar).

## 6. Server Components de dashboard y avanzado

- [x] 6.1 Convertir `src/app/page.tsx` en async Server Component: resolver `getCurrentPortfolio()` (o redirigir a login si aplica) y llamar `loadDashboardAggregate`; pasar los payloads como props a un `DashboardView` presentacional.
- [x] 6.2 Extraer la vista presentacional de `dashboard-page-client.tsx` a `src/features/dashboard/dashboard-view.tsx` (sin `"use client"`); mantener `useDashboardData` solo para el `reload()` contra el endpoint agregado (1 fetch).
- [x] 6.3 Quitar `"use client"` de `src/components/charts/summary-cards.tsx` (verificar que no use hooks/state/handlers; si los usa, revertir y documentar).
- [x] 6.4 Repetir 6.1–6.2 para `src/app/avanzado/page.tsx` y `avanzado-page-client.tsx` (vista presentacional + hook de reload contra el aggregate con `scope=advanced`).
- [x] 6.5 Ajustar `use-advanced-data.ts` para que use 1 fetch al endpoint agregado en lugar de 5.
- [x] 6.6 Mantener los charts `recharts` como `next/dynamic` con `ssr: false` (sin cambios).

## 7. Invalidación de caché

- [x] 7.1 Añadir `revalidatePath("/")` y `revalidatePath("/avanzado")` en `src/app/api/v1/trades/route.ts` (POST), `src/app/api/v1/trades/[id]/route.ts` (PATCH, DELETE) y `src/app/api/v1/imports/csv/commit/route.ts` (tras commit exitoso).
- [x] 7.2 Crear `src/app/api/v1/admin/cache/invalidate/route.ts` (POST) que acepte `{ tag: "market-prices" | "benchmark" }` y llame `revalidateTag`, protegido por un token de env (`ADMIN_CACHE_TOKEN`); devolver 401 si falta/matching.
- [x] 7.3 Añadir `ADMIN_CACHE_TOKEN` a `.env.example` con nota "server-only".
- [x] 7.4 Modificar las Edge Functions `supabase/functions/sync-prices/` y `sync-fx-rates/` para que, tras un sync exitoso, hagan `POST` al endpoint de invalidación con el tag correspondiente (usando ` Deno` fetch + env `APP_URL` + `ADMIN_CACHE_TOKEN`).

## 8. CSV commit batcheado

- [x] 8.1 En `src/app/api/v1/imports/csv/commit/route.ts`, eliminar el re-lookup por fila (líneas 147-152) y reutilizar el mapa de assets de la fase preview (`existingTickers`/`profileByTicker`).
- [x] 8.2 Recolectar tickers nuevos en un array; insertarlos en un solo `supabase.from("assets").insert([...]).select("id, ticker")` y construir `Map<ticker, assetId>` con el resultado.
- [x] 8.3 Construir el array de trades válidos (aplicando `normalizeTradeUsdValues` a cada uno); registrar en `errors` las filas que no validan o cuyo asset falló.
- [x] 8.4 Insertar los trades en `supabase.from("trades").insert([...])` (particionar en chunks de, p.ej., 500 si el payload es grande); manejar errores de constraint aislándolos en `errors`.
- [x] 8.5 Preservar el contrato del response: `importedCount` y `errors: { row_number, message }[]`.
- [x] 8.6 Actualizar/añadir tests que cubran: solo tickers conocidos (0 inserts de asset), tickers nuevos (1 insert de asset), filas mixtas válidas/inválidas, y forma del response.

## 9. Verificación y calidad

- [x] 9.1 `pnpm lint` sin errores nuevos.
- [x] 9.2 `pnpm test:run` verde (unit + schema PGlite).
- [x] 9.3 `pnpm build` exitoso (typecheck de facto).
- [x] 9.4 `pnpm test:e2e` verde (`tests/e2e/home.spec.ts`).
- [ ] 9.5 Verificación manual en `pnpm dev`: `view-source:` de `/` contiene datos reales (no "Cargando…"); DevTools Network muestra 0 calls de dashboard en primera carga server-rendered y 1 call en `reload`.
- [ ] 9.6 Verificar en DevTools que el import de un CSV de 500 filas emite ~3 queries de Supabase (no ~1000).
