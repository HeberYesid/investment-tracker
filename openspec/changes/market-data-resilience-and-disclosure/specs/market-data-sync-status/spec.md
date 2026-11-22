## ADDED Requirements

### Requirement: Sync status endpoint

The system MUST expose `GET /api/v1/market-data/sync-status` that returns a JSON body with the shape:

```
{
  "lastSuccessAt": ISO | null,
  "lastAttemptAt": ISO | null,
  "nextRunEstimate": ISO | null,
  "failedAssetCount": number,
  "lastFailureReason": "MARKET_CLOSED" | "UPSTREAM_NULL" | "RATE_LIMITED" | "NETWORK_ERROR" | "PARTIAL_FAILURE" | "TOTAL_FAILURE" | "NONE"
}
```

El endpoint DEBE exigir autenticación y resolver la membresía del portafolio activo antes de responder. Un helper interno de servidor DEBE leer la última corrida y el último éxito de `PRICES`; la tabla sigue siendo privada. El helper DEBE cruzar los fallos tipados por ID de activo con las posiciones abiertas ya autorizadas. Ningún rol recibe errores crudos, símbolos ni IDs de la corrida. Los timestamps describen la corrida global; el contador y el motivo de fallos parciales solo describen el portafolio autorizado. Tras siete días sin corridas, las fechas DEBEN ser nulas. Solo se puede cachear la lectura privada de corridas, con revalidación a 60 segundos; la autorización y el agregado se calculan por petición.

#### Scenario: Recent successful run
- **WHEN** an authenticated user hits the endpoint and the most recent `market_sync_runs` row (kind = `'PRICES'`) has `status = 'SUCCESS'` from 12 minutes ago and the run before that (24 minutes ago) was also `SUCCESS`
- **THEN** the response is `{ lastSuccessAt: <12 min ago>, lastAttemptAt: <12 min ago>, nextRunEstimate: <18 min from now>, failedAssetCount: 0, lastFailureReason: 'NONE' }`

#### Scenario: Recent failed run after a successful one
- **WHEN** the most recent run is `FAILED` (3 minutes ago) and the prior run was `SUCCESS` (33 minutes ago)
- **THEN** `lastSuccessAt` is the 33-min-ago timestamp, `lastAttemptAt` is the 3-min-ago timestamp, `nextRunEstimate` is `lastAttemptAt + 30 min` rounded up to the minute, and `lastFailureReason` is `'TOTAL_FAILURE'` for a portfolio with open positions. No raw error field is returned.

#### Scenario: Partial failure with categorized reason
- **WHEN** the most recent run is `SUCCESS` and a typed asset diagnostic for an open position is `RATE_LIMITED`
- **THEN** `lastFailureReason` is `'RATE_LIMITED'` and the banner logic in the client can use this to enrich the user-facing message

#### Scenario: All runs failed in the last 24 hours
- **WHEN** the last 10 runs are all `FAILED` and the last `SUCCESS` is older than 7 days
- **THEN** `lastSuccessAt` is `null`, `nextRunEstimate` is the 30-min projection from the most recent attempt, and `lastFailureReason` is `'TOTAL_FAILURE'`

#### Scenario: No recent runs
- **WHEN** `market_sync_runs` has no rows for the last 7 days
- **THEN** the response is `{ lastSuccessAt: null, lastAttemptAt: null, nextRunEstimate: null, failedAssetCount: 0, lastFailureReason: 'NONE' }`

#### Scenario: Unauthenticated request
- **WHEN** the request has no session cookie
- **THEN** the endpoint returns HTTP 401 with `{ error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }`

### Requirement: Sync health block in dashboard responses

The system MUST include a `sync: SyncHealth` block in `SummaryResponse` and `SnapshotResponse` (defined in `src/lib/validations/dashboard.ts`) so the client can render the banner with the same fields without making a separate request. `SyncHealth` MUST have the same shape as the response of `GET /api/v1/market-data/sync-status`. Server-side loaders (`src/lib/dashboard/loader.ts`, `src/lib/dashboard/snapshot.ts`) MUST compute `sync` by calling the same helper that backs the endpoint, so the snapshot endpoint and the sync-status endpoint cannot drift.

#### Scenario: Summary response includes sync block
- **WHEN** `GET /api/v1/dashboard/summary` is called and the last `SUCCESS` run was 12 minutes ago with `failedAssetCount: 0`
- **THEN** the response includes `sync: { lastSuccessAt: <12 min ago>, lastAttemptAt: <12 min ago>, nextRunEstimate: <18 min from now>, failedAssetCount: 0, lastFailureReason: 'NONE' }` alongside the existing `equityUsd`, `pnl`, etc.

#### Scenario: Snapshot response includes sync block
- **WHEN** `GET /api/v1/dashboard/snapshot` is called
- **THEN** the response includes `sync` with the same shape as the summary endpoint

### Requirement: Sync-status endpoint is rate-limited and cached

The endpoint MUST be protected against abuse with a per-user rate limit of 60 requests per minute (sliding window) using the same mechanism that protects other authenticated endpoints in the app. The server-side cache MUST be invalidated automatically on every successful `market_sync_runs` write — in practice, the 60-second TTL is short enough that cache misses refresh the data within one cron tick. The endpoint MUST NOT be called by the read path (dashboard, trade form) — those loaders MUST use the `sync` block included in their own responses.

#### Scenario: Rapid successive calls share the same cached payload
- **WHEN** two calls to the endpoint are made within 30 seconds and the underlying `market_sync_runs` table has not changed
- **THEN** both calls return identical bodies and the second call reuses only the cached read of the private run rows, not the authorization check

#### Scenario: Rate limit triggers
- **WHEN** a single user makes 61 calls in a 60-second window
- **THEN** the 61st call returns HTTP 429 with `{ error: { code: 'RATE_LIMITED', message: '...' } }`
