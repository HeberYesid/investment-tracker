## ADDED Requirements

### Requirement: Sync status endpoint

The system MUST expose `GET /api/v1/market-data/sync-status` that returns a JSON body with the shape:

```
{
  "lastSuccessAt": ISO | null,
  "lastAttemptAt": ISO | null,
  "nextRunEstimate": ISO | null,
  "failedAssetCount": number,
  "lastFailureReason": "MARKET_CLOSED" | "UPSTREAM_NULL" | "RATE_LIMITED" | "NETWORK_ERROR" | "PARTIAL_FAILURE" | "TOTAL_FAILURE" | "NONE",
  "lastFailureDetail": string | null
}
```

The endpoint MUST require an authenticated user (HTTP 401 with the standard error shape otherwise). The endpoint MUST read `market_sync_runs` (kind = `'PRICES'`) using `createServiceSupabaseClient()` (service role bypasses RLS) and MUST compute the response by combining the most recent `SUCCESS` row, the most recent `FAILED` row, and the most recent row of any status. The endpoint MUST NOT return the `error` column verbatim — it MUST categorize it into the `lastFailureReason` enum above and store the raw string in `lastFailureDetail` only if the user is an OWNER. The endpoint MUST return `lastSuccessAt: null` and `nextRunEstimate: null` if no rows exist for the last 7 days. The endpoint MUST cache the response for 60 seconds server-side using `unstable_cache` or equivalent.

#### Scenario: Recent successful run
- **WHEN** an authenticated user hits the endpoint and the most recent `market_sync_runs` row (kind = `'PRICES'`) has `status = 'SUCCESS'` from 12 minutes ago and the run before that (24 minutes ago) was also `SUCCESS`
- **THEN** the response is `{ lastSuccessAt: <12 min ago>, lastAttemptAt: <12 min ago>, nextRunEstimate: <18 min from now>, failedAssetCount: 0, lastFailureReason: 'NONE', lastFailureDetail: null }`

#### Scenario: Recent failed run after a successful one
- **WHEN** the most recent run is `FAILED` (3 minutes ago) and the prior run was `SUCCESS` (33 minutes ago)
- **THEN** `lastSuccessAt` is the 33-min-ago timestamp, `lastAttemptAt` is the 3-min-ago timestamp, `nextRunEstimate` is `lastAttemptAt + 30 min`, `lastFailureReason` is `'TOTAL_FAILURE'` and `lastFailureDetail` is the raw `error` string only if the user is an OWNER (otherwise `null`)

#### Scenario: Partial failure with categorized reason
- **WHEN** the most recent run is `SUCCESS` with `failedAssetCount: 3` and the `error` column contains `RATE_LIMITED`
- **THEN** `lastFailureReason` is `'RATE_LIMITED'` and the banner logic in the client can use this to enrich the user-facing message

#### Scenario: All runs failed in the last 24 hours
- **WHEN** the last 10 runs are all `FAILED` and the last `SUCCESS` is older than 7 days
- **THEN** `lastSuccessAt` is `null`, `nextRunEstimate` is the 30-min projection from the most recent attempt, and `lastFailureReason` is `'TOTAL_FAILURE'`

#### Scenario: No recent runs
- **WHEN** `market_sync_runs` has no rows for the last 7 days
- **THEN** the response is `{ lastSuccessAt: null, lastAttemptAt: null, nextRunEstimate: null, failedAssetCount: 0, lastFailureReason: 'NONE', lastFailureDetail: null }`

#### Scenario: Unauthenticated request
- **WHEN** the request has no session cookie
- **THEN** the endpoint returns HTTP 401 with `{ error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }`

### Requirement: Sync health block in dashboard responses

The system MUST include a `sync: SyncHealth` block in `SummaryResponse` and `SnapshotResponse` (defined in `src/lib/validations/dashboard.ts`) so the client can render the banner with the same fields without making a separate request. `SyncHealth` MUST have the same shape as the response of `GET /api/v1/market-data/sync-status`. Server-side loaders (`src/lib/dashboard/loader.ts`, `src/lib/dashboard/snapshot.ts`) MUST compute `sync` by calling the same helper that backs the endpoint, so the snapshot endpoint and the sync-status endpoint cannot drift.

#### Scenario: Summary response includes sync block
- **WHEN** `GET /api/v1/dashboard/summary` is called and the last `SUCCESS` run was 12 minutes ago with `failedAssetCount: 0`
- **THEN** the response includes `sync: { lastSuccessAt: <12 min ago>, lastAttemptAt: <12 min ago>, nextRunEstimate: <18 min from now>, failedAssetCount: 0, lastFailureReason: 'NONE', lastFailureDetail: null }` alongside the existing `equityUsd`, `pnl`, etc.

#### Scenario: Snapshot response includes sync block
- **WHEN** `GET /api/v1/dashboard/snapshot` is called
- **THEN** the response includes `sync` with the same shape as the summary endpoint

### Requirement: Sync-status endpoint is rate-limited and cached

The endpoint MUST be protected against abuse with a per-user rate limit of 60 requests per minute (sliding window) using the same mechanism that protects other authenticated endpoints in the app. The server-side cache MUST be invalidated automatically on every successful `market_sync_runs` write — in practice, the 60-second TTL is short enough that cache misses refresh the data within one cron tick. The endpoint MUST NOT be called by the read path (dashboard, trade form) — those loaders MUST use the `sync` block included in their own responses.

#### Scenario: Rapid successive calls share the same cached payload
- **WHEN** two calls to the endpoint are made within 30 seconds and the underlying `market_sync_runs` table has not changed
- **THEN** both calls return identical bodies and the second call does not re-query the database

#### Scenario: Rate limit triggers
- **WHEN** a single user makes 61 calls in a 60-second window
- **THEN** the 61st call returns HTTP 429 with `{ error: { code: 'RATE_LIMITED', message: '...' } }`
