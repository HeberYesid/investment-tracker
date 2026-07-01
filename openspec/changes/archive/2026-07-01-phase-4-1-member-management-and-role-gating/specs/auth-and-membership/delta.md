## MODIFIED Requirements

### Requirement: requireApiUserWithPortfolio accepts a writeAccess option

The `requireApiUserWithPortfolio` helper in `src/lib/api/auth.ts` MUST
accept an optional second argument of the shape
`{ writeAccess?: boolean }`. When `writeAccess: true` and the caller's
role is `VIEWER`, the helper MUST return a 403 response with the
project's standard `{ error: { code: "FORBIDDEN", message: ... } }`
envelope and MUST NOT call any downstream Supabase mutation. The default
behavior (no second argument) MUST be identical to the current
implementation: no role check, just a 401 if unauthenticated and a 400 if
the user has no portfolio.

#### Scenario: WRITE request from EDITOR succeeds
- **WHEN** the caller's role is EDITOR and `writeAccess: true`
- **THEN** the helper returns `{ user, supabase, portfolio, response: null }`
  with `portfolio.role === "EDITOR"`

#### Scenario: WRITE request from VIEWER is rejected
- **WHEN** the caller's role is VIEWER and `writeAccess: true`
- **THEN** the helper returns `{ user: null, supabase: null, portfolio:
  null, response: NextResponse }` with `response.status === 403` and
  `response.body.error.code === "FORBIDDEN"`

#### Scenario: READ request does not require writeAccess
- **WHEN** the helper is called with no second argument
- **THEN** the behavior is unchanged (no role check)

### Requirement: Trade and import write routes enforce writeAccess

The POST, PATCH, and DELETE handlers in
`src/app/api/v1/trades/route.ts` and
`src/app/api/v1/trades/[id]/route.ts`, and the POST handlers in
`src/app/api/v1/imports/csv/preview/route.ts` and
`src/app/api/v1/imports/csv/commit/route.ts` MUST call
`requireApiUserWithPortfolio(undefined, { writeAccess: true })` (or the
positional equivalent) so that VIEWERs are rejected with a uniform 403
before any Supabase write runs.

#### Scenario: VIEWER POSTs a trade
- **WHEN** a VIEWER posts to `/api/v1/trades`
- **THEN** the response is `403 FORBIDDEN` and no `trades` row is
  inserted (verified by the audit_events count remaining unchanged)

#### Scenario: VIEWER commits a CSV
- **WHEN** a VIEWER posts to `/api/v1/imports/csv/commit`
- **THEN** the response is `403 FORBIDDEN`
