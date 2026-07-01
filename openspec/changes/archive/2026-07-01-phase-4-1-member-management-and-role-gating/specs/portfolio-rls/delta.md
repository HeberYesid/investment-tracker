## MODIFIED Requirements

### Requirement: Trades, csv_imports, csv_import_rows, alerts, and audit_events RLS

The write policies on `public.trades`, `public.csv_imports`,
`public.csv_import_rows`, `public.alerts`, and `public.audit_events` MUST
accept `role in ('OWNER','EDITOR')` instead of `role = 'OWNER'`. The
read policies and the policies on `public.portfolio_members` are
unchanged.

For `trades`, `csv_imports`, `alerts`, and `audit_events` the `INSERT`,
`UPDATE`, and `DELETE` policies MUST use
`current_user_has_role(portfolio_id, 'OWNER') or
current_user_has_role(portfolio_id, 'EDITOR')` for both the `USING` and
`WITH CHECK` clauses.

For `csv_import_rows` the `INSERT`, `UPDATE`, and `DELETE` policies MUST
scope the role check transitively through `csv_imports.portfolio_id`,
using the same `('OWNER','EDITOR')` predicate.

The original `('OWNER'`-only policies MUST be dropped before the new
policies are created (idempotency: `drop policy if exists ...`).

(This is a tightening of the existing requirement in
`openspec/changes/phase-4-auth-permissions/specs/portfolio-rls/spec.md`,
specifically the "Trades, imports, snapshots, alerts, alert_events, and
audit_events RLS" requirement. The rest of that requirement is unchanged:
reads remain `current_user_is_member(...)`, and `portfolio_members`
remains OWNER-only.)

#### Scenario: EDITOR can create a trade
- **WHEN** an EDITOR of the portfolio inserts a row into `public.trades`
- **THEN** the row is created (no permission error) and the corresponding
  `audit_events` row is also created

#### Scenario: VIEWER cannot create a trade
- **WHEN** a VIEWER attempts to insert a row into `public.trades`
- **THEN** the insert affects zero rows (RLS still blocks VIEWERs)

#### Scenario: EDITOR can update a trade
- **WHEN** an EDITOR updates an existing trade in their portfolio
- **THEN** the update succeeds and the new `audit_events` row is also
  created

#### Scenario: EDITOR can import a CSV (preview + commit)
- **WHEN** an EDITOR posts to `csv_imports` (preview) and then commits
- **THEN** both the preview row and the resulting trade rows are created
