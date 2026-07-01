# portfolio-member-management Specification

## Purpose
TBD - created by archiving change phase-4-1-member-management-and-role-gating. Update Purpose after archive.
## Requirements
### Requirement: Lookup user id by email

The system MUST expose `public.find_user_by_email(p_email text) returns uuid` — a `SECURITY DEFINER`, `STABLE` function that returns the `id` of the `auth.users` row whose `email` matches the (case-insensitive, trimmed) input, or `null` if no match exists. The function MUST declare `set search_path = public` and MUST be granted `execute` to `authenticated`.

#### Scenario: Existing user is found
- **WHEN** an OWNER calls `select public.find_user_by_email('user@example.com')` and `auth.users` has a row with `email = 'user@example.com'`
- **THEN** the function returns that user's `id`

#### Scenario: Email is not registered
- **WHEN** no `auth.users` row has a matching email
- **THEN** the function returns `null`

#### Scenario: Email matching is case-insensitive
- **WHEN** the caller passes `User@Example.com` and the row stores `user@example.com`
- **THEN** the function still returns the matching `id`

### Requirement: Count portfolio owners

The system MUST expose `public.count_portfolio_owners(p_portfolio_id uuid) returns integer` — a `SECURITY DEFINER`, `STABLE` function that returns the number of rows in `public.portfolio_members` where `portfolio_id` matches and `role = 'OWNER'`. The function MUST declare `set search_path = public` and MUST be granted `execute` to `authenticated`.

#### Scenario: One owner
- **WHEN** the portfolio has exactly one `OWNER` row
- **THEN** the function returns `1`

#### Scenario: Multiple owners
- **WHEN** the portfolio has two `OWNER` rows
- **THEN** the function returns `2`

#### Scenario: Zero owners (should never happen in practice)
- **WHEN** the portfolio has no `OWNER` rows
- **THEN** the function returns `0`

### Requirement: Current user role lookup

The system MUST expose `public.current_user_role(p_portfolio_id uuid) returns text` — a `SECURITY DEFINER`, `STABLE` function that returns the caller's `role` (one of `OWNER`, `EDITOR`, `VIEWER`) in the portfolio, or `null` if the caller has no membership. The function MUST declare `set search_path = public` and MUST be granted `execute` to `authenticated`.

#### Scenario: Caller is OWNER
- **WHEN** `auth.uid()` has an `OWNER` row for the portfolio
- **THEN** the function returns `'OWNER'`

#### Scenario: Caller is not a member
- **WHEN** `auth.uid()` has no row in `portfolio_members` for the portfolio
- **THEN** the function returns `null`

### Requirement: List portfolio members

The API at `GET /api/v1/portfolio/members` MUST return a JSON object of the shape `{ data: Array<{ user_id: string; email: string; role: 'OWNER' | 'EDITOR' | 'VIEWER'; created_at: string }> }`. The endpoint MUST be OWNER-only. Non-OWNER callers MUST receive `403 { error: { code: "FORBIDDEN", ... } }`.

#### Scenario: OWNER lists members
- **WHEN** the caller is an OWNER of the current portfolio
- **THEN** the response is `200` and `data` contains every member of the portfolio with their email resolved from `auth.users` via `find_user_by_email`

#### Scenario: EDITOR attempts to list
- **WHEN** the caller is an EDITOR
- **THEN** the response is `403 FORBIDDEN` and the body has the project's standard error envelope

#### Scenario: Unauthenticated request
- **WHEN** no `auth.uid()` is present
- **THEN** the response is `401 UNAUTHORIZED`

### Requirement: Invite an existing user by email

The API at `POST /api/v1/portfolio/members` MUST accept a JSON body of `{ email: string, role: 'EDITOR' | 'VIEWER' }`. The endpoint MUST be OWNER-only. The server MUST:
1. Look up the user via `public.find_user_by_email`.
2. Return `404 NOT_FOUND` if no match.
3. Return `409 CONFLICT` if the user is already a member of the portfolio.
4. Otherwise insert a new row in `public.portfolio_members` with the requested role and return `201` with the new member's payload.

#### Scenario: New editor is invited
- **WHEN** the caller is an OWNER and `email` resolves to a user who is not yet a member
- **THEN** the response is `201` and a new `EDITOR` row exists

#### Scenario: Email is not registered
- **WHEN** `find_user_by_email` returns `null`
- **THEN** the response is `404 NOT_FOUND` with the project's standard envelope and the message "No encontramos un usuario con ese correo — pídele que inicie sesión primero."

#### Scenario: User is already a member
- **WHEN** the user already has a `portfolio_members` row for the portfolio
- **THEN** the response is `409 CONFLICT`

#### Scenario: Role is OWNER
- **WHEN** the request body has `role: 'OWNER'`
- **THEN** the response is `422 VALIDATION_ERROR` (only EDITOR and VIEWER can be assigned via this endpoint — the original OWNER is created by the `handle_new_user` trigger and cannot be re-assigned through the API)

### Requirement: Change a member's role

The API at `PATCH /api/v1/portfolio/members/:id` MUST accept `{ role: 'OWNER' | 'EDITOR' | 'VIEWER' }` and MUST be OWNER-only. The server MUST:
1. Verify the target member exists in the current portfolio.
2. If the change would leave the portfolio with zero OWNERs (i.e. the target is currently OWNER and the new role is not OWNER), return `409 CONFLICT` with the project's standard envelope and the message "No puedes dejar el portafolio sin propietarios."
3. Otherwise update the row and return `200` with the updated payload.

#### Scenario: EDITOR is promoted to OWNER
- **WHEN** the target is currently EDITOR and the new role is OWNER
- **THEN** the response is `200` and the row reflects the new role

#### Scenario: Last OWNER is demoted
- **WHEN** the target is the only OWNER and the new role is EDITOR
- **THEN** the response is `409 CONFLICT`

#### Scenario: One of two OWNERs is demoted
- **WHEN** the portfolio has two OWNERs and one is changed to EDITOR
- **THEN** the response is `200` and the other OWNER remains

### Requirement: Remove a member

The API at `DELETE /api/v1/portfolio/members/:id` MUST be OWNER-only. The server MUST:
1. Verify the target member exists in the current portfolio.
2. If the target is the only OWNER, return `409 CONFLICT`.
3. Otherwise delete the row and return `204 No Content`.

#### Scenario: VIEWER is removed
- **WHEN** the target is a VIEWER
- **THEN** the response is `204`

#### Scenario: Last OWNER is removed
- **WHEN** the target is the only OWNER
- **THEN** the response is `409 CONFLICT`

### Requirement: No direct access to auth.users from clients

The `select` privilege on the `auth.users` table MUST NOT be granted to `authenticated` or `anon`. The only client-facing surface that reads from `auth.users` MUST be `public.find_user_by_email`. Any attempt to call `select email from auth.users` from an authenticated session MUST return zero rows (the table is owned by `supabase_auth` and is not part of the PostgREST exposure).

#### Scenario: PostgREST does not expose auth.users
- **WHEN** an authenticated client calls the PostgREST endpoint `GET /auth/v1/users` or `select * from auth.users`
- **THEN** the request is rejected with a permission error
