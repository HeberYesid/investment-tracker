## Why

El chart "Evolución del portafolio" del dashboard (`src/components/charts/evolution-chart.tsx`) muestra saltos discretos cada vez que el usuario registra una nueva operación. Por ejemplo, una posición de $100 a fin de mes salta a $443 al mes siguiente si el usuario compró un activo nuevo por $343 en ese mes. Esto contradice la expectativa de una línea de "evolución" (una serie que refleja valor de mercado en el tiempo) y la hace inutilizable para visualizar la trayectoria del portafolio.

La causa raíz es que `buildPortfolioValueSeries` (`src/lib/calculations/evolution.ts:117-156`) usa `trade.price_usd` como proxy de "último precio de mercado" para cada activo, así que la única manera de que el valor cambie entre meses es que ocurra un trade. Phase 3 documentó esta limitación como un riesgo conocido (`openspec/changes/phase-3-dashboard-mvp/design.md:5`, R1) y Phase 5 (`market-data-sync` spec) extendió `market_prices` con fuente `BENCHMARK_HISTORY` para el S&P 500 — pero **no** hay histórico de precios para los activos del usuario, por lo que la evolution chart sigue en modo "estimated" del Phase 3.

Este cambio cierra esa brecha: backfill de histórico de precios para los assets del usuario (réplica del patrón del benchmark) y reescritura del cálculo de evolución para usar el último precio conocido por bucket en lugar del último trade price.

## What Changes

- **Nuevo Edge Function `sync-asset-prices-history`** (`supabase/functions/sync-asset-prices-history/`). Réplica de la lógica de `benchmark-backfill.ts` aplicada a cada asset con `yahoo_symbol IS NOT NULL` y `quantity > 0` en `holdings`. Yahoo `fetchHistory(symbol, "2y")`. Upsert idempotente por `(asset_id, observed_at)`.
- **Nueva cron job** `sync-asset-prices-history-daily` (00:30 UTC, vía `pg_cron`). Pausar con `select cron.unschedule(...)` igual que los otros.
- **Extender `POST /api/v1/admin/sync/run`** para aceptar `{ kind: 'PRICES_HISTORY' }` además de `'PRICES' | 'FX'`. Reusa el patrón del endpoint existente.
- **Refactor de `buildPortfolioValueSeries`** (`src/lib/calculations/evolution.ts`). Acepta un nuevo input opcional `historicalPrices: Map<assetId, Array<{date, priceUsd}>>`. Para cada bucket, `priceAtBucket(assetId, bucketDate) = last(observed_at <= bucketDate)`; si no hay, fallback al último trade price. `computeValue()` cambia de `Σ quantity * latestPriceUsd` a `Σ quantity * priceAtBucket`.
- **Loader de dashboard extendido** (`src/lib/dashboard/loader.ts`). Nueva query que carga `market_prices` con `source = 'PRICE_HISTORY'` para los assets del portafolio. `unstable_cache` con tag `asset-prices-history:{portfolioId}` para invalidación granular al disparar el sync manual.
- **Wire en `loadDashboardAggregate`** (`src/lib/dashboard/aggregate.ts:89`). Pasa el `historicalPrices` al cálculo. Reusa el mismo `holdings` (D1 del phase 3).
- **UI disclosure**: `evolutionFootnote` (`src/lib/i18n/dashboard.ts:25`) cambia a un mensaje que indique que los valores provienen de cotizaciones de fin de mes, no de precios de trade. El banner amarillo de "Valores estimados" se mantiene solo cuando no hay histórico disponible para un asset.
- **Tests**: extender `src/__tests__/calculations/evolution.test.ts` con casos históricos. Agregar fixture CSV/market_prices en `tests/fixtures/` y un test e2e que verifique que la serie usa precios históricos.

**BREAKING**: la respuesta de `EvolutionResponse` (en `src/lib/validations/dashboard.ts`) podría ganar un campo `isEstimated: boolean` opcional para que el chart muestre u oculte el footnote amarillo. Sin este campo el chart cae al comportamiento actual. No se eliminan campos.

## Capabilities

### New Capabilities

- `portfolio-evolution`: contrato de la serie de evolución del portafolio. Define el algoritmo de cálculo (precio por bucket desde `market_prices.PRICE_HISTORY`, fallback al trade price, sin pisar el precio con dividendos/fees), la respuesta de los endpoints `/api/v1/dashboard/evolution` y `/api/v1/dashboard/aggregate`, y la disclosure visual (footnote + bandera estimada).

### Modified Capabilities

- `market-data-sync`: nueva requirement "Asset price history backfill" cubriendo el Edge Function `sync-asset-prices-history`, la cron `sync-asset-prices-history-daily`, la extensión de `POST /api/v1/admin/sync/run` con `kind: 'PRICES_HISTORY'`, y la convención de `market_prices.source = 'PRICE_HISTORY'`.
- `market-data-ui`: nueva requirement "Evolution chart staleness disclosure" describiendo que el footnote cambia cuando hay histórico y que el banner "Precio estimado" se mantiene solo cuando `historicalPrices` no cubre el bucket.

## Impact

- **Código nuevo**:
  - `supabase/functions/sync-asset-prices-history/index.ts`
  - `supabase/functions/sync-asset-prices-history/_shared/*` (logger, supabase client)
  - `src/lib/dashboard/asset-prices-history.ts` (loader similar a `benchmark-backfill.ts`)
  - `src/lib/dashboard/asset-prices-history.test.ts`
- **Código modificado**:
  - `src/lib/calculations/evolution.ts` (nuevo input + nuevo `priceAtBucket`)
  - `src/lib/calculations/evolution.test.ts` (extender casos)
  - `src/lib/dashboard/loader.ts` (nueva query + cache tag)
  - `src/lib/dashboard/aggregate.ts` (wire del input)
  - `src/lib/validations/dashboard.ts` (campo `isEstimated` opcional en `EvolutionResponse`)
  - `src/lib/i18n/dashboard.ts` (`evolutionFootnote` actualizado)
  - `src/app/api/v1/admin/sync/run/route.ts` (kind `'PRICES_HISTORY'`)
  - `src/app/api/v1/admin/sync/run/route.test.ts` (test del nuevo kind)
  - `supabase/functions/sync-asset-prices-history/...` (función Deno)
  - Nueva migración `0010_asset_price_history.sql`: `pg_cron` job + (opcional) CHECK constraint que agrega `'PRICE_HISTORY'` a la lista de sources permitidas en `market_prices`.
- **APIs**:
  - `GET /api/v1/dashboard/aggregate` y `GET /api/v1/dashboard/evolution` ahora pueden devolver puntos con valores basados en histórico de mercado. No breaking.
  - `POST /api/v1/admin/sync/run` acepta un nuevo `kind`. Aditivo.
- **DB**:
  - Crecimiento de `market_prices` ≈ 730 filas/asset para el backfill inicial de 2 años. Aceptable para Supabase Free.
  - Nueva fila en `market_sync_runs` por cada ejecución del Edge Function (reusa el schema existente).
- **Dependencias**: ninguna nueva. Yahoo provider ya expone `fetchHistory`.
- **Cost guardrail (USD 0/mes)**: el cron corre una vez al día, los assets con `quantity > 0` están acotados por el portafolio del usuario, y Yahoo Finance no requiere API key. Sin nuevos cargos.
