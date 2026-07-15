# portfolio-rls Specification

## Purpose

Row Level Security policies for portfolios, portfolio members, trades, imports, and related tables using portfolio membership checks.

## Requirements

### Requirement: Portfolio membership helper functions

The system MUST expose two SQL functions in the `public` schema:
- `current_user_is_member(p_portfolio_id uuid) returns boolean` — returns true if `auth.uid()` has any row in `public.portfolio_members` for `p_portfolio_id`.
- `current_user_has_role(p_portfolio_id uuid, p_role text) returns boolean` — returns true if `auth.uid()` has a row in `public.portfolio_members` for `p_portfolio_id` with `role = p_role`.

Both functions MUST be `SECURITY DEFINER`, `STABLE`, declare `set search_path = public`, and be granted `execute` to `authenticated`.

#### Scenario: Membership check for an OWNER
- **WHEN** `auth.uid()` matches a `portfolio_members` row with `role = 'OWNER'`
- **THEN** `current_user_is_member(p_portfolio_id)` returns true and `current_user_has_role(p_portfolio_id, 'OWNER')` returns true

#### Scenario: Membership check for a non-member
- **WHEN** `auth.uid()` has no `portfolio_members` row for the portfolio
- **THEN** both functions return false

### Requirement: Row Level Security on every public table

Every table in the `public` schema MUST have row level security enabled. The schema test SHALL fail if any new public table is added without `enable row level security`.

#### Scenario: Adding a new public table requires RLS
- **WHEN** a new table is created in `public` without `enable row level security`
- **THEN** the foundation schema test fails

### Requirement: Portfolios RLS uses membership

The `public.portfolios` table MUST have RLS policies so that:
- A `SELECT` is allowed if `current_user_is_member(id)` is true.
- An `INSERT` is allowed if `(select auth.uid()) = user_id`.
- An `UPDATE` is allowed if `current_user_has_role(id, 'OWNER')` is true.
- A `DELETE` is allowed if `current_user_has_role(id, 'OWNER')` is true.

#### Scenario: Member can read their portfolio
- **WHEN** an authenticated user queries `public.portfolios`
- **THEN** they see only the portfolios where they have a `portfolio_members` row

#### Scenario: Non-member cannot read another portfolio
- **WHEN** an authenticated user queries `public.portfolios` for a portfolio they are not a member of
- **THEN** the query returns zero rows

#### Scenario: Only OWNER can update or delete
- **WHEN** a member with role `VIEWER` (or any non-OWNER role) attempts to `UPDATE` or `DELETE` the portfolio
- **THEN** the operation affects zero rows

### Requirement: Portfolio members RLS

The `public.portfolio_members` table MUST have RLS policies so that any `SELECT`, `INSERT`, `UPDATE`, or `DELETE` is allowed only if `current_user_has_role(portfolio_id, 'OWNER')` is true. This applies symmetrically to the `USING` and `WITH CHECK` clauses.

#### Scenario: OWNER sees members
- **WHEN** an OWNER of a portfolio queries `public.portfolio_members` for that portfolio
- **THEN** all member rows for the portfolio are returned

#### Scenario: Non-OWNER cannot read members
- **WHEN** a non-OWNER member queries `public.portfolio_members`
- **THEN** the query returns zero rows

### Requirement: Trades, imports, snapshots, alerts, alert_events, and audit_events RLS

For the tables `public.trades`, `public.csv_imports`, `public.csv_import_rows`, `public.portfolio_snapshots`, `public.alerts`, `public.alert_events`, and `public.audit_events`:
- `SELECT` MUST be allowed if `current_user_is_member(portfolio_id)` is true (for tables that scope by `portfolio_id` directly) or transitively through a join to `csv_imports` (for `csv_import_rows`) and `alerts` (for `alert_events`).
- `INSERT`, `UPDATE`, and `DELETE` MUST be allowed only if `current_user_has_role(<portfolio_id>, 'OWNER')` is true. For `csv_import_rows`, the check goes through `csv_imports.portfolio_id`.

#### Scenario: Member can read trades
- **WHEN** an OWNER of a portfolio queries `public.trades` for that portfolio
- **THEN** all non-soft-deleted trades for the portfolio are returned

#### Scenario: Non-member cannot read trades
- **WHEN** an authenticated user with no membership on the queried portfolio runs `SELECT * FROM public.trades`
- **THEN** zero rows are returned

#### Scenario: Only OWNER can write trades
- **WHEN** a non-OWNER member attempts `INSERT`/`UPDATE`/`DELETE` on `public.trades`
- **THEN** the operation affects zero rows

### Requirement: Profiles RLS unchanged

The `public.profiles` table MUST keep its existing policies: a user can `SELECT` and `UPDATE` only the row where `id = auth.uid()`. No `INSERT` or `DELETE` policy is required because the trigger creates the row and cascades on user deletion.

#### Scenario: User can read their own profile
- **WHEN** an authenticated user queries `public.profiles`
- **THEN** they see exactly their own row

#### Scenario: User cannot read another user's profile
- **WHEN** an authenticated user queries `public.profiles` with a filter that does not match their id
- **THEN** zero rows are returned

### Requirement: Reference tables remain public-readable

The tables `public.brokers`, `public.assets`, `public.market_prices`, and `public.fx_rates` MUST remain readable by `anon` and `authenticated` (the existing "reference" / "market prices" / "fx rates" policies).

#### Scenario: Unauthenticated catalog read
- **WHEN** the `anon` role queries `public.brokers`
- **THEN** the broker seed rows are returned
