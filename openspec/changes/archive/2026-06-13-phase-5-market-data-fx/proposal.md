## Why

El dashboard ya está listo para usar precios de mercado, pero hoy `market_prices` siempre está vacía: nadie los llena. Como consecuencia, el valor del portafolio cae a `TRADE_FALLBACK` (precio de la última operación) para todos los activos, y la tarjeta de "Comparación con benchmark" del dashboard sigue siendo un placeholder. Además, las operaciones en COP requieren que el usuario pegue la tasa de cambio a mano en cada formulario. La fase 5 cierra ese hueco trayendo precios retrasados y FX de proveedores gratuitos, refrescándolos en background, y exponiéndolos al dashboard y al formulario de trades.

## What Changes

- Nuevas interfaces `MarketDataProvider` y `FxRateProvider` en `src/lib/market-data/` y `src/lib/fx/`, con una implementación por proveedor detrás de cada una. La lógica de negocio y el dashboard sólo consumen las interfaces.
- Implementación `YahooFinanceMarketDataProvider` (endpoint `/v8/finance/chart`) con respuestas validadas por Zod, mapeo `assets.yahoo_symbol ?? assets.ticker`, y soporte para `getQuote` y `getBenchmarkSeries`.
- Implementación `OpenErApiFxRateProvider` (endpoint `https://open.er-api.com/v6/latest/USD`) para `COP -> USD`, validada con Zod.
- Dos Edge Functions de Supabase: `sync-prices` (batch global de activos con posición > 0 + benchmark S&P 500) y `sync-fx-rates` (par `USD -> COP`).
- Migración nueva `0004_market_data_sync.sql` con `pg_cron` que programa `sync-prices` cada 30 min y `sync-fx-rates` diario, y una función helper `enqueue_sync_run` para invocaciones manuales desde un endpoint admin.
- Endpoint `POST /api/v1/admin/sync/run` (solo OWNER) que dispara `sync-prices` o `sync-fx-rates` bajo demanda para development; no se usa en producción.
- Endpoint `GET /api/v1/market-data/snapshot` que devuelve, para el portafolio del usuario, `{ quotes: [...], fxCopToUsd, benchmark }`. Reemplaza la consulta cruda a `market_prices` que hoy hace `loadDashboardData`.
- Reemplazar `BenchmarkPlaceholder` por `BenchmarkChart` que muestra S&P 500 (`^GSPC`) normalizado a 100 superpuesto con la evolución del portafolio.
- Indicador de staleness en `SummaryCards` y en cada fila de `DistributionChart`: `observed_at` > 2 h muestra badge ámbar; sin cotización muestra badge gris con copy "Precio estimado".
- Formulario de trades: cuando `currency_original === "COP"`, pre-rellenar `fx_rate_to_usd` con la última tasa guardada y mostrar fecha de observación + badge de staleness. El usuario puede sobreescribirla.
- Stale threshold centralizado en `src/lib/market-data/staleness.ts` (precios > 2 h, FX > 24 h).
- Tabla `market_sync_runs` (id, kind, started_at, finished_at, status, assets_processed, error) para auditoría y debugging. Insertada por las Edge Functions.

## Capabilities

### New Capabilities

- `market-data-providers`: el sistema expone `MarketDataProvider` y `FxRateProvider` como interfaces; las implementaciones de Yahoo Finance y open.er-api.com son intercambiables; toda respuesta de terceros se valida con Zod antes de persistir.
- `market-data-sync`: el sistema refresca precios de activos con posición abierta y la paridad COP/USD en background, en batch global único, sin polling desde el navegador, dentro de los límites del free tier de Supabase Edge Functions.
- `market-data-ui`: el dashboard muestra precios reales cuando están disponibles, marca los precios como "stale" o "estimado" según la edad del dato, compara la evolución del portafolio contra S&P 500, y el formulario de trades COP pre-rellena la tasa de cambio con la última persistida.

### Modified Capabilities

- (vacío — no hay specs previas en el repo)

## Impact

- **DB**: nueva migración `supabase/migrations/0004_market_data_sync.sql`. Crea `market_sync_runs` (RLS solo `service_role`), habilita `pg_cron` y `pg_net` si no lo están, agenda dos jobs, y crea la función `enqueue_sync_run(kind)`. La disponibilidad de las extensiones en Supabase Free se asume; si no lo están, se documenta el fallback (Edge Function + cron externo).
- **Edge Functions**: nuevos directorios `supabase/functions/sync-prices/index.ts` y `supabase/functions/sync-fx-rates/index.ts` (Deno). Sin secretos externos. Usan `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` que Supabase inyecta automáticamente.
- **Lógica de negocio**: nuevo `src/lib/market-data/` (interface, provider Yahoo, parser Zod, staleness, símbolos, loader); nuevo `src/lib/fx/` (interface, provider open.er-api.com, parser Zod, staleness, loader).
- **API**: nuevo `src/app/api/v1/market-data/snapshot/route.ts` (GET) y `src/app/api/v1/admin/sync/run/route.ts` (POST, OWNER only). `lib/dashboard/loader.ts` se refactoriza para llamar al snapshot en vez de hacer su propio join a `market_prices`.
- **UI**: se sustituye `BenchmarkPlaceholder` por `BenchmarkChart` en `src/features/dashboard/dashboard-page-client.tsx`. `SummaryCards` y `DistributionChart` ganan un slot de staleness. `TradeForm` consume un nuevo hook `useLatestFxRate` para el caso COP. Strings nuevos en `src/lib/i18n/dashboard.ts` y `src/lib/i18n/trades.ts`.
- **Dependencias**: ninguna nueva (Zod y Supabase ya están). Deno aparece en la toolchain sólo para `supabase/functions` (no para el resto del repo, que sigue siendo Node + pnpm).
- **Tests**:
  - `tests/unit/market-data/yahoo-finance.test.ts` con fixtures grabados de `/v8/finance/chart` (200 válido, 404, payload malformado, payload con `meta.regularMarketPrice === null`).
  - `tests/unit/fx/open-er-api.test.ts` con fixtures grabados.
  - `tests/unit/market-data/staleness.test.ts` y `tests/unit/fx/staleness.test.ts`.
  - `tests/integration/market-data/snapshot.test.ts` (Vitest + PGlite) que ejercita el endpoint contra la DB en memoria, sin tocar red.
  - Extiende `src/supabase/migrations/schema.test.ts` para que valide la tabla `market_sync_runs` y la presencia de los jobs `pg_cron`.
- **Operaciones**: el README gana una sección "Sincronización de precios y FX" que explica la cadencia, los costos esperados (~43K invocaciones/mes, lejos de 500K) y cómo deshabilitar los crons si se quiere bajar a cero.
- **Out of scope (no entra en esta fase)**:
  - Backfill histórico de trades COP con FX rates por fecha (queda como idea para una 5.1).
  - UI admin para editar `assets.yahoo_symbol` (queda para 5.1).
  - COLCAP como benchmark adicional (queda para 5.1 si se valida que Yahoo lo soporta con granularidad diaria).
  - Alertas de precio (Phase 6) — el cimiento de precios se construye aquí, las alertas se montan encima.
  - Caché de respuestas del provider en el Edge Function (la tabla `market_prices` ya es el caché; evitar doble cachear).
  - Backoff / reintentos: las Edge Functions se limitan a un único intento por tick; los fallos se loguean en `market_sync_runs.status = 'FAILED'`.
