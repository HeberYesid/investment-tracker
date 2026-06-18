## MODIFIED Requirements

### Requirement: Dashboard staleness badges

`SummaryCards` MUST show a "Precio estimado" badge in Spanish when at least one holding has no `market_prices` row (estimated equity). It MUST also show a "Precio desactualizado" badge when at least one quote in the snapshot has `isStale: true` **OR** when the last sync attempt impacted the user's portfolio and produced a failure (the criteria for "real impact" is defined in the next requirement). When the "Precio desactualizado" badge is shown, it MUST include three lines: (1) the title, (2) the relative time of the last successful sync, formatted in Spanish via `formatRelativeEs(sync.lastSuccessAt)` (e.g. "Última actualización: hace 2 h 14 min"), and (3) a Spanish reason string derived from `sync.lastFailureReason` (one of: "Mercado cerrado", "El proveedor no devolvió precio", "Proveedor con límite de peticiones", "Error de red con el proveedor", "Sincronización parcial: algunos activos no se actualizaron", "La última sincronización falló", or no reason line when `lastFailureReason = 'NONE'`). The badge MUST also include `sync.nextRunEstimate` as a secondary line when the last run failed (e.g. "Próximo intento: en ~18 min") and MUST omit it when the last run was a success. `DistributionChart` rows MUST show a clock-icon with `observedAt` as a tooltip for market-priced rows and a dotted "≈" prefix for estimated rows. The clock-icon tooltip MUST include the source of the data, e.g. "Cotización del 14 jun 18:32 · Fuente: Yahoo" or "Cotización del 14 jun 18:32 · Fuente: Stooq". All copy MUST live in `src/lib/i18n/dashboard.ts` and `src/lib/i18n/dates.ts`.

#### Scenario: Mixed estimated and market data with real impact
- **WHEN** the snapshot contains two market quotes (one stale) and one estimated row, and the last sync attempt was a `SUCCESS` with `failedAssetCount: 0`
- **THEN** `SummaryCards` shows both badges, with the stale banner showing "Última actualización: hace 2 h 14 min" and no reason line, and `DistributionChart` shows the clock icon on the market row with the tooltip "Cotización del <fecha> · Fuente: Yahoo" and the "≈" prefix on the estimated row

#### Scenario: All data fresh
- **WHEN** every holding has a market quote and none are stale, and the last sync attempt was a `SUCCESS` with `failedAssetCount: 0`
- **THEN** neither badge is shown and `DistributionChart` renders without clock icons or "≈" prefixes

#### Scenario: Sync run failed but did not impact the user's portfolio
- **WHEN** every holding has a fresh market quote (none stale) and the last sync run had `failedAssetCount: 3` for symbols the user does not hold
- **THEN** neither badge is shown — the failure is not the user's problem

#### Scenario: Sync run failed and impacted the user's portfolio
- **WHEN** at least one holding is stale and the last sync run was a `FAILED` (status = `'FAILED'`)
- **THEN** the stale banner is shown with the reason "La última sincronización falló" and the secondary line "Próximo intento: en ~X min" derived from `sync.nextRunEstimate`

#### Scenario: Reason mapping
- **WHEN** `sync.lastFailureReason` is `'RATE_LIMITED'`
- **THEN** the banner reason line is "Proveedor con límite de peticiones"

### Requirement: Banner only shows on real impact

`SummaryCards` MUST show the "Precio desactualizado" badge only when at least one of these conditions holds:
1. `snapshot.isAnyStale === true` (at least one quote in the user's portfolio is older than `STALE_PRICE_MS`).
2. `snapshot.isAnyEstimated === true` (at least one holding has no `market_prices` row).
3. `sync.lastFailureReason === 'TOTAL_FAILURE'` AND at least one holding's most recent `market_prices.observed_at` is older than `sync.lastSuccessAt` (i.e. the user is missing fresh data because of the failure).

The badge MUST NOT be shown when the only reason for concern is a partial failure on symbols the user does not hold. The implementation MUST compute this in `src/lib/dashboard/snapshot.ts` (or an equivalent helper) and expose the boolean as `snapshot.shouldShowStaleBanner` (a new boolean field added to `SnapshotResponse`).

#### Scenario: Partial failure on unrelated symbols
- **WHEN** the user's portfolio is fully fresh but the last sync had `failedAssetCount: 2` for symbols the user does not hold
- **THEN** `shouldShowStaleBanner` is `false` and the banner is not rendered

#### Scenario: Total failure
- **WHEN** the last sync was `FAILED` (status = `'FAILED'`) and the user's most recent `market_prices` rows are older than 3 hours
- **THEN** `shouldShowStaleBanner` is `true` and the banner is rendered with the failure reason

#### Scenario: Stale asset exists
- **WHEN** at least one holding has `observed_at` older than `STALE_PRICE_MS` and `sync.lastFailureReason === 'NONE'`
- **THEN** `shouldShowStaleBanner` is `true` and the banner is rendered with the relative time but no failure reason

#### Scenario: Estimated assets only
- **WHEN** at least one holding has no `market_prices` row at all
- **THEN** `shouldShowStaleBanner` is `true` and the "Precio estimado" banner is rendered (this is a separate banner that already exists; the rule applies equally)
