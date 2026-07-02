## Context

El chart "Evolución del portafolio" (`src/components/charts/evolution-chart.tsx`) y la línea de portfolio del `BenchmarkChart` (`src/components/charts/benchmark-chart.tsx`) se calculan con `buildPortfolioValueSeries` (`src/lib/calculations/evolution.ts:85-196`). Hoy esa función asigna a cada activo un `latestPriceUsd = trade.price_usd` (línea 151) y reporta `Σ quantity * latestPriceUsd` por bucket. Consecuencia: la única manera de que el valor cambie entre dos meses es que ocurra un trade. Una posición de $100 que recibe un buy de $343 a fin de mes salta a $443 — exactamente el síntoma que reportó el usuario.

Phase 3 documentó la limitación como riesgo conocido R1 (`openspec/changes/phase-3-dashboard-mvp/design.md:5`) y Phase 5 (`market-data-sync` spec) extendió `market_prices` con `source = 'BENCHMARK_HISTORY'` para el S&P 500, pero **no** agregó backfill de histórico para los activos del usuario. Por lo tanto, el chart sigue atrapado en el modo "estimated" original, y el footnote amarillo (`evolutionFootnote` en `src/lib/i18n/dashboard.ts:25-26`) ya reconoce el problema sin resolverlo.

Phase 5 además dejó dos artefactos que se pueden reusar directamente:

- `supabase/functions/sync-prices/index.ts:42-111` ya contiene la lógica `backfillBenchmarkHistory` con la estrategia de upsert idempotente (`seenDays` por `utcDayKey(observed_at)`), la `market_sync_runs` audit table, el pattern `recordRunStart`/`recordRunSuccess`/`recordRunFailure`, y la invalidación de cache tags.
- `supabase/functions/_shared/yahoo.ts` ya expone `fetchYahooHistory(symbol, range, interval)` con retry + backoff y `PriceProviderError` normalizado.
- `supabase/migrations/0004_market_data_sync.sql` define `enqueue_sync_run(p_kind text)` con una rama por `kind` y la convención de wrapping con `do $$ ... if exists (select 1 from pg_proc p join pg_namespace n ... where n.nspname = 'cron' and p.proname = 'schedule') ... $$` para que PGlite (schema test) pueda aplicar la migración sin `pg_cron`.

Este cambio reutiliza todos esos artefactos y agrega el backfill de histórico para los activos del usuario + un input opcional de precios históricos en el cálculo de la serie.

## Goals / Non-Goals

**Goals:**
- Reemplazar la valoración por "último trade price" del cálculo de evolución por "último precio de mercado conocido al cierre del bucket" usando `market_prices.PRICE_HISTORY` cuando exista, con fallback explícito al último `BUY`/`SELL` price cuando no haya histórico.
- Excluir trades de `DIVIDEND`, `FEE`, `TRANSFER_IN` y `TRANSFER_OUT` del cómputo del precio de fallback (el bug latente en la línea 151 de `evolution.ts`).
- Mantener el chart y sus endpoints sin breaking changes: la serie se vuelve más suave, pero los campos existentes (`granularity`, `from`, `to`, `points[].date`, `points[].valueUsd`) permanecen.
- Exponer `isEstimated` en `EvolutionResponse` para que `EvolutionChart` pueda mostrar el footnote histórico (`evolutionFootnoteHistorical`) o el estimado original (`evolutionFootnote`) según corresponda.
- Mantener el constraint de USD 0/mes: el cron es diario, los assets están acotados por el portafolio del usuario, y Yahoo Finance no requiere API key.

**Non-Goals:**
- No se persisten snapshots diarios en `portfolio_snapshots` (esa tabla existe en `0001_foundation.sql:114` pero Phase 3 D4 explícitamente lo dejó fuera y no se introduce acá).
- No se migra la UI a TanStack Query ni se rediseña la jerarquía de charts.
- No se cambia el formato del wire de los endpoints existentes salvo agregar `isEstimated: boolean` opcional en `EvolutionResponse`.
- No se introduce la collection de profiles de Yahoo (sector/country) — sigue siendo responsabilidad del enrichment de Phase 5/6.
- No se modifica la lógica de `sync-prices` intraday (30 min) — el backfill histórico es una cron separada.
- No se hace backfill retroactivo de los puntos ya en cache: el `unstable_cache` de Next se invalida por tag en cada ejecución del sync manual.

## Decisions

### D1. Nueva source `PRICE_HISTORY` en `market_prices`, sin schema nuevo

El `market_prices.source` es `text` libre (constraint solo en algunos otros `source` de otras tablas, ver `0001_foundation.sql:100`). No hace falta migración de schema para agregar el valor `'PRICE_HISTORY'`. Sí hace falta:

- Ampliar el CHECK de `market_sync_runs.kind` (línea 57 de `0004_market_data_sync.sql`) para incluir `'PRICES_HISTORY'`. Esto requiere una nueva migración `0010_asset_price_history.sql` con `alter table ... drop constraint ... add constraint ... check (kind in ('PRICES', 'FX', 'PRICES_HISTORY'))`. El DROP+ADD es necesario porque `0001_foundation.sql` es inmutable.
- Agregar rama `'PRICES_HISTORY'` a la función `enqueue_sync_run` (`0004_market_data_sync.sql:74-118`) que dispare `net.http_post` a `/functions/v1/sync-asset-prices-history`.

**Alternativa considerada:** agregar un nuevo enum `market_price_source` en `market_prices`. Rechazado porque requiere un `alter type` que es invasivo y porque el patrón existente ya usa `text` libre. El nuevo valor sigue la convención del codebase (uppercase snake).

### D2. Refactor mínimo de `buildPortfolioValueSeries`

La función actual (`src/lib/calculations/evolution.ts:85-196`) itera trades y mantiene un `Map<assetId, { quantity, latestPriceUsd }>`. El cambio:

- Renombrar `latestPriceUsd` → `fallbackPriceUsd` (semántica: solo se usa si no hay histórico).
- Agregar input opcional `historicalPricesByAsset: Map<assetId, Array<{observedAt: string, priceUsd: number}>>` (default `new Map()`).
- En la rama de procesamiento por trade:
  - `BUY` / `SELL` actualizan `quantity` y `fallbackPriceUsd = trade.price_usd` (preserva el comportamiento actual como fallback).
  - `DIVIDEND` / `FEE` / `TRANSFER_IN` / `TRANSFER_OUT` **no** tocan `fallbackPriceUsd` (fix del bug latente).
- En la rama de `computeValue()`, `priceAtBucket(asset, bucketDate)`:
  1. Buscar el último `historicalPricesByAsset.get(asset).find(p => p.observedAt.slice(0,10) <= bucketDate.slice(0,10))`.
  2. Si no hay, usar `fallbackPriceUsd` del estado en el bucket.
  3. Si el asset no estaba en el portafolio en ese bucket (quantity = 0), excluir.
- Devolver además `isEstimated: boolean` en el resultado, calculado como "algún bucket tuvo que usar fallback para algún asset".

**Alternativa considerada:** reescribir la función para iterar buckets primero y luego trades dentro de cada bucket. Rechazado porque el orden actual (procesar trades secuencialmente) es lo que permite calcular la cantidad mantenida al final de cada bucket correctamente. Iterar buckets primero requeriría reconstruir el `assetState` por bucket, complicando el código sin ganancia.

### D3. Loader extendido con cache tag granular

`src/lib/dashboard/loader.ts:111-127` ya tiene `fetchLatestMarketPrices` con `unstable_cache` + tag `"market-prices"`. Se agrega `fetchHistoricalPrices(assetIds: string[])` con `unstable_cache` + tag `"asset-prices-history:{portfolioId}"` (tag por portafolio para invalidar al disparar el sync manual sin tirar el cache de otros portafolios).

La query es:

```ts
supabase
  .from("market_prices")
  .select("asset_id, price_usd, observed_at")
  .in("asset_id", assetIds)
  .eq("source", "PRICE_HISTORY")
  .gte("observed_at", from)
  .lte("observed_at", to)
  .order("observed_at", { ascending: true });
```

El resultado se agrupa en un `Map<assetId, Array<{observedAt, priceUsd}>>` y se pasa a `buildPortfolioValueSeries` desde `loadDashboardAggregate`.

**Alternativa considerada:** cargar todo el histórico (sin filtro `from`/`to`) en memoria. Rechazado porque la ventana del chart es acotada (1-2 años típicamente) y filtrar en la query reduce el rowcount en Supabase Free.

### D4. Edge Function `sync-asset-prices-history` como función separada, no como side-effect de `sync-prices`

`sync-prices` corre cada 30 min y solo necesita quotes intraday. El backfill histórico es diario, batch más grande (~520 puntos/asset), y debe tolerar fallos individuales sin abortar. Mezclar ambos en una sola función complica el audit (`market_sync_runs.kind`) y el timeout del cron.

La nueva función `supabase/functions/sync-asset-prices-history/index.ts` reusa:

- `getServiceClient` (`_shared/supabase.ts`).
- `recordRunStart` / `recordRunSuccess` / `recordRunFailure` (`_shared/record-sync-run.ts`) — esos helpers ya aceptan `kind: "PRICES_HISTORY"`.
- `fetchYahooHistory` (`_shared/yahoo.ts`).
- `invalidateCacheTag("asset-prices-history:{portfolioId}")` para cada portafolio afectado.

Gate: si ya hay una fila de `market_prices.PRICE_HISTORY` con `observed_at >= startOfTodayUtc()` para el asset, skip (igual que el gate de `backfillBenchmarkHistory` en `sync-prices:47-58`). Esto evita re-fetch Yahoo todos los días para activos que ya tienen histórico completo.

**Alternativa considerada:** llamar a `backfillBenchmarkHistory` desde acá. No aplica — es código de benchmark, no de asset.

### D5. Cron diaria, no intraday, para el histórico

`sync-asset-prices-history-daily` corre a las 00:30 UTC. La historia solo necesita un punto por día de trading (Yahoo `range=2y, interval=1d` da ~500 puntos), así que la frecuencia diaria es suficiente y minimiza la carga de Yahoo. La posición en 00:30 (justo después de `sync-prices-30m` a 00:00) garantiza que el backfill vea el precio intraday del día anterior ya persistido.

**Alternativa considerada:** correr el backfill una vez al ingreso de un trade nuevo (lazy). Rechazado porque dispara muchos fetches en cadena y porque la estrategia gate "ya hay histórico para hoy" hace que el cron diario sea idempotente.

### D6. UI disclosure con dos footnotes

En lugar de cambiar el significado del `evolutionFootnote` actual (que dice "Valores estimados a partir de los precios de tus operaciones"), se introduce `evolutionFootnoteHistorical` en `src/lib/i18n/dashboard.ts` (e.g., "Valores basados en cotizaciones de mercado de fin de mes."). `EvolutionChart` recibe `isEstimated` como prop y renderiza exactamente uno de los dos. Esto preserva el mensaje original para cuando el sistema no tiene histórico y agrega uno nuevo para cuando sí lo tiene, sin ambigüedad.

**Alternativa considerada:** mostrar siempre el nuevo footnote y mover el amarillo a un badge separado en `SummaryCards`. Rechazado porque rompe el principio de que la fuente de verdad de la disclosure es el chart mismo (D2 del phase 3 market-data-ui).

## Risks / Trade-offs

- **[R1] Storage growth en Supabase Free** → 730 filas/asset para 2 años de backfill × N assets del portafolio. Aceptable: Supabase Free soporta 500 MB de DB, y `market_prices` con un asset y 2 años ocupa <50 KB. Monitorear si el usuario tiene >20 activos con histórico (sería ~1 MB extra, todavía OK). Mitigation: documentar el límite en README; permitir `range=1y` como fallback si se observa presión.
- **[R2] Yahoo Finance rate limits** → El cron diario + el retry con backoff en `_shared/yahoo.ts` ya mitigan. Yahoo tolera ~100 req/h por IP para `chart` endpoint sin auth; un portafolio con <100 activos está bien. Mitigation: si `listActiveAssets` retorna >100 assets, paginar el batch en chunks de 50 con `setTimeout` entre chunks.
- **[R3] Cache invalidation timing** → El `unstable_cache` de Next se invalida por tag, pero el dashboard puede tener un response cacheado por 60 s (revalidate). El usuario podría ver valores viejos hasta 60 s después del sync. Mitigation: el botón "Sincronizar ahora" en la UI (cuando exista) debe usar `revalidateTag` adicional, o se documenta el lag.
- **[R4] Performance del algoritmo con N assets × M buckets** → `priceAtBucket` es O(M) por lookup. Con monthly default (12 buckets/año) y 2 años de histórico (24 buckets) × 20 assets, son 480 lookups. Cada lookup es una búsqueda lineal en el array histórico del asset (~500 puntos). Total: ~240k comparaciones. Aceptable para el target MVP (trading persona, no HFT). Mitigation si se vuelve lento: precomputar un `Map<bucketKey, priceUsd>` por asset antes del loop principal.
- **[R5] Time zone semantics** → `observed_at` viene de Yahoo en UTC; los buckets se calculan con `monthEnd` que también está en UTC. Sin embargo, los trades del usuario se almacenan con la hora local del broker. Esto puede causar que un trade del 31 de enero (hora Colombia = UTC-5) caiga en `2025-02-01` UTC. El algoritmo actual ya lidia con esto implícitamente; el nuevo algoritmo mantiene el mismo comportamiento. Mitigation: documentar en `evolution.ts` que `bucketDate` siempre es UTC.
- **[R6] Assets con `yahoo_symbol` distinto al `ticker`** → `backfillBenchmarkHistory` usa `benchmark.yahoo_symbol ?? benchmark.ticker`. Mismo patrón se aplica al nuevo backfill. Si Yahoo no reconoce el `yahoo_symbol` configurado, el backfill falla para ese asset y se registra en `market_sync_runs.error`. No aborta el batch. Mitigation: el usuario puede re-configurar `yahoo_symbol` desde un futuro UI de asset-edit (fuera de scope).
- **[R7] `DIVIDEND` corrupte el `fallbackPriceUsd` latente** → El bug actual en `evolution.ts:151` también afecta a la serie. El fix en D2 lo resuelve: `DIVIDEND` ya no toca `fallbackPriceUsd`. Pero si el usuario ya tenía un chart con valores estimados incorrectos, esos valores no se autocorrigen al refrescar. Mitigation: el primer render post-deploy con histórico disponible usará el histórico, que es la fuente de verdad.

## Migration Plan

1. **Deploy la migración `0010_asset_price_history.sql`** (extiende CHECK de `market_sync_runs.kind`, agrega rama `'PRICES_HISTORY'` a `enqueue_sync_run`, registra el cron `sync-asset-prices-history-daily`).
2. **Deploy el Edge Function `sync-asset-prices-history`** (vía `supabase functions deploy sync-asset-prices-history`).
3. **Deploy el código Next** (loader, evolution, aggregate, route, i18n, components).
4. **Trigger manual inicial**: el OWNER hace `POST /api/v1/admin/sync/run` con `{ kind: "PRICES_HISTORY" }` para popular `market_prices.PRICE_HISTORY` con el histórico de los activos del portafolio actual. Repetir por cada portafolio en uso, o esperar al cron del día siguiente.
5. **Rollback**: `select cron.unschedule('sync-asset-prices-history-daily')` pausa el cron. El código Next tiene fallback al comportamiento previo cuando `historicalPricesByAsset` está vacío (default `new Map()`), así que un redeploy del código sin la migración es seguro.

## Open Questions

- **Q1**: ¿`range=2y` es suficiente? Yahoo devuelve ~500 puntos diarios. Para portafolios con <2 años de historia, es más que suficiente. Para portafolios con >2 años, los buckets previos a 2 años caerán al fallback. Si el usuario reporta "mi portafolio tiene 3 años y la serie empieza hace 2", considerar extender a `range=max`. **Decisión propuesta**: empezar con `2y` (consistente con benchmark) y dejar `range` configurable via env var `SYNC_PRICE_HISTORY_RANGE` para iterar.
- **Q2**: ¿Vale la pena hacer backfill al insertar un trade nuevo? La estrategia gate "ya hay fila para hoy" hace que sea un no-op si el cron ya corrió. Pero si el usuario registra su primer trade de un activo, el backfill para ese activo no se gatilla hasta el día siguiente. **Decisión propuesta**: agregar una llamada a `sync-asset-prices-history` desde `POST /api/v1/trades` cuando el asset no tiene histórico (best-effort, fire-and-forget). Requiere un cambio en la route handler. **Pospuesto a v2** si la fricción es baja en la práctica.
- **Q3**: ¿El campo `isEstimated` debería estar también en `SummaryResponse` para reflejar el agregado? Phase 5 ya tiene `SummaryResponse.isEstimated` y `isAnyStale` que reflejan el estado del snapshot, no de la serie de evolución. Mantener separados es correcto (la spec de `market-data-ui` ya lo aclara en el scenario "Evolution is historical but one holding is estimated").
