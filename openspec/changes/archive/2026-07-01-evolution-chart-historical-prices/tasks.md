## 1. Migración SQL

- [x] 1.1 Crear `supabase/migrations/0010_asset_price_history.sql` con el header `-- 0010_asset_price_history.sql` y la nota de inmutabilidad de `0001_foundation.sql`
- [x] 1.2 En la misma migración, ampliar el CHECK de `market_sync_runs.kind` a `('PRICES', 'FX', 'PRICES_HISTORY')` usando `alter table ... drop constraint ... add constraint ...` (la original `0004_market_data_sync.sql:57` es inmutable, así que se reemplaza acá)
- [x] 1.3 Reemplazar la función `public.enqueue_sync_run` con una versión que tenga una rama `if p_kind = 'PRICES_HISTORY'` que dispare `net.http_post` a `/functions/v1/sync-asset-prices-history` con `{ runId }`; mantener las ramas `'PRICES'` y `'FX'` idénticas
- [x] 1.4 Agregar `perform cron.schedule('sync-asset-prices-history-daily', '30 0 * * *', $cmd$ select public.enqueue_sync_run('PRICES_HISTORY'); $cmd$)` dentro del mismo `do $$ ... if exists ... $$` que ya usan los crons de Phase 5; antes del `perform`, hacer `delete from cron.job where jobname = 'sync-asset-prices-history-daily'` para idempotencia
- [x] 1.5 Verificar que `pnpm test:run` (en particular `src/supabase/migrations/schema.test.ts`) aplique la nueva migración contra PGlite sin errores

## 2. Edge Function `sync-asset-prices-history`

- [x] 2.1 Crear `supabase/functions/sync-asset-prices-history/index.ts` con la estructura de `sync-prices/index.ts` (imports de `_shared/supabase`, `_shared/record-sync-run`, `_shared/yahoo`, `_shared/invalidate-cache`)
- [x] 2.2 Implementar `listActiveAssetSymbols(supabase)` que devuelva `Array<{assetId, yahooSymbol}>` para todo asset con `quantity > 0` y `yahoo_symbol IS NOT NULL`; reusar el patrón de fallback de `sync-prices/index.ts:113-162` (no `execute_sql` RPC)
- [x] 2.3 Implementar `backfillAssetHistory(supabase, asset, todayGate)` que retorne `{inserted, skipped, message?}`: gate de "ya hay fila para hoy" con `count` head query (igual a `sync-prices/index.ts:47-58`), `fetchYahooHistory(symbol, "2y", "1d")`, dedupe por `utcDayKey(observed_at)` con `seenDays`, `insert` con `source = "PRICE_HISTORY"`
- [x] 2.4 Implementar el handler `Deno.serve` que: parsea `runId` del body, llama `createPendingRun` o usa el del body, `recordRunStart`, itera assets con `for (const asset of assets) { const r = await backfillAssetHistory(...); aggregate errors }`, `recordRunSuccess` con `assets_processed` igual al número de assets con filas insertadas exitosas
- [x] 2.5 En el handler, llamar `invalidateCacheTag("asset-prices-history")` (tag global de Next, no por portafolio, porque el Edge Function no tiene contexto de portafolio)
- [x] 2.6 Deploy local con `supabase functions deploy sync-asset-prices-history` y verificar que el `POST` retorna 200 con `{ runId, assetsProcessed, errors }` y que `market_sync_runs` tiene una fila nueva con `kind = 'PRICES_HISTORY'`

## 3. Loader del dashboard

- [x] 3.1 En `src/lib/dashboard/loader.ts`, agregar `HistoricalPriceRow` type alias para `{asset_id, price_usd, observed_at}`
- [x] 3.2 Agregar `fetchHistoricalPrices(assetIds: string[], from: string, to: string)` con `unstable_cache` key `["asset-prices-history", assetIds.join(",")]` y tag `"asset-prices-history"`, `revalidate: 60`; query: `from("market_prices").select(...).in("asset_id", assetIds).eq("source", "PRICE_HISTORY").gte("observed_at", from).lte("observed_at", to).order("observed_at", { ascending: true })`
- [x] 3.3 Agregar `loadHistoricalPrices(assetIds, from, to, _supabase)` que delega a `fetchHistoricalPrices` (igual al patrón `loadLatestMarketPrices` en `loader.ts:129-135`)
- [x] 3.4 Extender `DashboardData` (en `loader.ts:8-14`) con `historicalPrices: Array<{asset_id, price_usd, observed_at}>`; poblar en `loadDashboardData` (línea 137) llamando a `loadHistoricalPrices(assetIds, from, to, supabase)` con `from = firstTradeDate` y `to = today`
- [x] 3.5 Test unit en `src/lib/dashboard/loader.test.ts` (crear si no existe) que mocke `createServiceSupabaseClient` y verifique que `loadDashboardData` invoca la query de histórico con los `assetIds` correctos y agrupa los resultados por `asset_id`

## 4. Refactor de `buildPortfolioValueSeries`

- [x] 4.1 En `src/lib/calculations/evolution.ts:83`, renombrar `AssetState.latestPriceUsd` a `AssetState.fallbackPriceUsd` (y todas las referencias, líneas 117, 137, 151)
- [x] 4.2 En el loop de trades (líneas 128-156), eliminar `current.fallbackPriceUsd = trade.price_usd;` para trades cuyo `trade_type` no sea `BUY` o `SELL` (la línea 151 actual lo aplica a todos); mantener la asignación solo dentro de los cases `BUY`/`SELL`/`TRANSFER_IN`/`TRANSFER_OUT` (los `TRANSFER_*` sí llevan precio de mercado)
- [x] 4.3 En `BuildEvolutionOptions` (línea 32), agregar campo opcional `historicalPricesByAsset?: Map<string, Array<{observedAt: string, priceUsd: number}>>` con default `new Map()`
- [x] 4.4 Reescribir `computeValue()` (línea 117) para aceptar `bucketDate: string` y delegar a un nuevo helper `priceAtBucket(assetId, bucketDate)` que: (1) busca en `historicalPricesByAsset.get(assetId)` el último punto con `observedAt <= bucketDate`, (2) si no hay, devuelve `state.fallbackPriceUsd`, (3) si `state.quantity === 0`, devuelve 0 (excluir del Σ)
- [x] 4.5 En el loop que asigna `bucketToValue` (líneas 176-185), pasar la fecha del bucket a `computeValue`; cambiar el branch de "no hay explicitValue" para usar `lastValue` carry-forward en vez de `computeValue()` (fix del bug de gap-bucket que usa el estado final en vez del estado al momento del gap)
- [x] 4.6 En el return de la función (línea 195), agregar `isEstimated: boolean` que se calcula como "algún bucket tuvo que usar fallback para algún asset"

## 5. Wire en `loadDashboardAggregate`

- [x] 5.1 En `src/lib/dashboard/aggregate.ts:89`, transformar `data.historicalPrices` en el `Map<assetId, Array<{observedAt, priceUsd}>>` esperado por `buildPortfolioValueSeries`
- [x] 5.2 Pasar ese map como `historicalPricesByAsset` en las options (línea 89-93)
- [x] 5.3 Mapear el `series.isEstimated` retornado por la función al `EvolutionResponse.isEstimated` del payload (línea 94-99)
- [x] 5.4 Verificar que `/api/v1/dashboard/aggregate` y `/api/v1/dashboard/evolution` ambos pasan por este path (uno via `loadDashboardAggregate`, el otro llama a `buildPortfolioValueSeries` directo en `route.ts:32`)

## 6. Endpoint `/api/v1/admin/sync/run`

- [x] 6.1 En `src/app/api/v1/admin/sync/run/route.ts:11`, ampliar el enum Zod a `z.enum(["PRICES", "FX", "PRICES_HISTORY"])`
- [x] 6.2 Verificar que la llamada a `enqueue_sync_run` (`route.ts:35-37`) sigue funcionando con el nuevo `kind` (la función SQL ya está actualizada en 1.3)
- [x] 6.3 Test en `src/app/api/v1/admin/sync/run/route.test.ts` (crear/actualizar) que verifique: (a) OWNER con `{kind: "PRICES_HISTORY"}` retorna 202 con runId, (b) VIEWER/EDITOR retorna 403, (c) body inválido retorna 400

## 7. UI

- [x] 7.1 En `src/lib/validations/dashboard.ts:68`, agregar `isEstimated: z.boolean()` al schema `EvolutionResponse` (campo nuevo, default implícito `false` en el server cuando no se setea)
- [x] 7.2 En `src/lib/i18n/dashboard.ts:25`, agregar `evolutionFootnoteHistorical: "Valores basados en cotizaciones de mercado de fin de mes. Sincroniza para mantenerlos al día."` (o copy equivalente, pendiente revisión con el usuario) justo después de `evolutionFootnote`
- [x] 7.3 En `src/components/charts/evolution-chart.tsx:52`, agregar `isEstimated: boolean` a `EvolutionChartProps` (default `true` para backward-compat en otros consumidores)
- [x] 7.4 En el JSX del chart (línea 136-140), reemplazar la condición fija `{isEstimated && (...)}` por una ternaria que muestre `evolutionFootnoteHistorical` cuando `!isEstimated` y `evolutionFootnote` cuando `isEstimated`; nunca ambos
- [x] 7.5 En `src/features/dashboard/evolution-chart-lazy.tsx:22`, agregar `isEstimated` a las props del wrapper
- [x] 7.6 En `src/features/dashboard/dashboard-view.tsx:55-60`, pasar `isEstimated={payload.evolution?.isEstimated ?? true}` al `EvolutionChartLazy`

## 8. Tests

- [x] 8.1 En `src/__tests__/calculations/evolution.test.ts`, agregar test "uses historical price for held asset when available" con dos BUY en Feb (uno a $100, otro a $200) y un histórico con Feb=$110, Mar=$115; verificar que el valor de Feb usa $110 y el de Mar usa $115
- [x] 8.2 Mismo archivo, test "falls back to trade price when no history" con un BUY a $100 y un map de histórico vacío; verificar que el valor cae al trade price
- [x] 8.3 Mismo archivo, test "DIVIDEND does not corrupt the price" con un BUY a $100 seguido de un DIVIDEND con `price_usd=0`; verificar que el valor del bucket post-DIVIDEND sigue siendo $100 (no $0)
- [x] 8.4 Mismo archivo, test "series isEstimated is false when fully historical" y "series isEstimated is true when fallback used"
- [x] 8.5 Mismo archivo, test "gap bucket carries forward last value" (regression test del fix en 4.5) con un BUY en Jan, un BUY en Mar, y sin trades en Feb; verificar que Feb muestra el mismo valor que Jan
- [x] 8.6 Crear `src/lib/dashboard/asset-prices-history.test.ts` con test unit de `listActiveAssetSymbols` y `backfillAssetHistory` mockeando `getServiceClient` y `fetchYahooHistory`
- [x] 8.7 Crear `tests/e2e/evolution-historical-prices.spec.ts` que: (a) crea un asset con `yahoo_symbol = "AAPL"`, (b) inserta manualmente 3 filas en `market_prices` con `source = "PRICE_HISTORY"` en meses consecutivos, (c) registra un BUY, (d) navega al dashboard, (e) verifica que el chart tiene al menos 2 puntos y que el tooltip del segundo punto usa el precio histórico (no el trade price)

## 9. Verificación final

- [x] 9.1 Correr `pnpm lint` — debe pasar sin warnings nuevos
- [x] 9.2 Correr `pnpm exec tsc --noEmit` — debe pasar sin errores
- [x] 9.3 Correr `pnpm test:run` — todos los tests existentes + los nuevos (8.1-8.6) deben pasar
- [x] 9.4 Correr `pnpm build` — debe completar sin errores (esto valida que el `isEstimated` agregado a `EvolutionResponse` no rompe consumidores existentes gracias al default server-side)
- [x] 9.5 Verificar manualmente: deploy a staging, OWNER triggerea `POST /api/v1/admin/sync/run` con `{kind: "PRICES_HISTORY"}`, espera ~30 s, recarga el dashboard, y confirma que el chart se ve más suave y que el footnote dice "Valores basados en cotizaciones de mercado de fin de mes" en vez de "Valores estimados a partir de los precios de tus operaciones"
- [x] 9.6 Correr `openspec status --change "evolution-chart-historical-prices"` y confirmar que `applyRequires: ["tasks"]` está done antes de mergear
