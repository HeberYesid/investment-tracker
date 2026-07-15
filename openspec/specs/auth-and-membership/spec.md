# auth-and-membership Specification

## Purpose

Supabase Auth with magic link, session management, route protection, and automatic profile/portfolio creation on signup.

## Requirements

### Requirement: Magic link signup and login

The system SHALL allow any visitor to sign in by submitting an email address at `/login`. The system MUST send a Supabase magic link to that address and, when the user clicks the link, establish a session cookie and redirect to the application home (`/`).

#### Scenario: Successful sign-in on a fresh visit
- **WHEN** an unauthenticated visitor opens `/`
- **THEN** the system redirects them to `/login`

#### Scenario: Magic link request accepted
- **WHEN** the visitor submits a valid email at `/login`
- **THEN** the system shows a confirmation that the link was sent and does not reveal whether the email exists

#### Scenario: Magic link callback establishes session
- **WHEN** the user clicks the magic link and lands on `/auth/callback` with a valid code
- **THEN** the system exchanges the code for a session, sets Supabase auth cookies, and redirects to `/`

#### Scenario: Expired or invalid magic link
- **WHEN** the user lands on `/auth/callback` with an expired or invalid code
- **THEN** the system redirects to `/auth/error` with a human-readable Spanish message

#### Scenario: Sign out
- **WHEN** an authenticated user posts to `/api/v1/auth/signout`
- **THEN** the system clears the Supabase session, returns a success response, and the next page navigation triggers a redirect to `/login`

### Requirement: Authenticated route protection

The system SHALL block any unauthenticated request to a protected route. Page navigations MUST redirect to `/login` (preserving the original path in a `next` query parameter when possible). API route handlers MUST return HTTP 401 with a JSON body of shape `{ error: { code: "UNAUTHORIZED", message: "No autenticado." } }`.

#### Scenario: Protected page without session
- **WHEN** an unauthenticated request hits `/`, `/trades`, `/import`, or any other page in the allowlist of protected routes
- **THEN** the system redirects the response to `/login`

#### Scenario: Protected API without session
- **WHEN** an unauthenticated request hits `/api/v1/trades`, `/api/v1/dashboard/summary`, or any other `/api/v1/*` route other than `/api/v1/auth/*`
- **THEN** the system returns 401 with the standard unauthorized JSON shape

#### Scenario: Allowlisted routes remain reachable
- **WHEN** an unauthenticated request hits `/login`, `/auth/callback`, `/auth/error`, or `/api/v1/auth/signout`
- **THEN** the system does not redirect and does not return 401

### Requirement: Default profile and portfolio on signup

The system MUST, on insert into `auth.users`, create a row in `public.profiles`, a row in `public.portfolios` named `'Mi portafolio'`, and a row in `public.portfolio_members` linking the new user to that portfolio with role `OWNER`. The operation MUST be idempotent so that re-running the trigger logic on the same user is a no-op.

#### Scenario: New user gets a portfolio automatically
- **WHEN** a row is inserted into `auth.users`
- **THEN** exactly one row exists in `public.profiles` for that user id, exactly one row in `public.portfolios` with `name = 'Mi portafolio'` and `user_id = new.id`, and exactly one row in `public.portfolio_members` with `role = 'OWNER'`

#### Scenario: Re-running the trigger is safe
- **WHEN** the trigger logic is invoked a second time for the same user
- **THEN** no duplicate `profiles` or `portfolio_members` rows are created

### Requirement: Current user and current portfolio helpers

The system SHALL expose server-side helpers `getCurrentUser()`, `requireUser()`, `getCurrentPortfolio()`, and `requireApiUser()`. `getCurrentUser()` returns the Supabase user or `null`. `requireUser()` returns the user or redirects to `/login`. `getCurrentPortfolio()` returns `{ portfolioId, role, portfolio }` for the current user, or `null` if the user has no membership. `requireApiUser()` returns `{ user, supabase, response }` where `response` is a ready-to-return `NextResponse` if the request is unauthenticated, otherwise `user` and `supabase` (a user-scoped Supabase client) are non-null.

#### Scenario: Page component fetches the current portfolio
- **WHEN** a Server Component calls `getCurrentPortfolio()` while the user is signed in
- **THEN** it receives an object with `portfolioId`, `role`, and `portfolio` for the user's only portfolio

#### Scenario: API route receives a user-scoped client
- **WHEN** a Route Handler calls `requireApiUser()` while the user is signed in
- **THEN** it receives a `supabase` client bound to the user's JWT so subsequent queries are subject to RLS

### Requirement: All application APIs use user-scoped Supabase client

The system MUST NOT use the service role key in any application Route Handler. All existing `/api/v1/*` routes (trades, imports, dashboard) MUST obtain their Supabase client through `requireApiUser()` and MUST derive the `portfolio_id` for writes from `getCurrentPortfolio()` instead of accepting it from the request body or auto-creating a `Default` portfolio.

#### Scenario: POST /api/v1/trades writes to the user's portfolio
- **WHEN** an authenticated user posts a trade without specifying `portfolio_id`
- **THEN** the trade is inserted with the portfolio id returned by `getCurrentPortfolio()`

#### Scenario: CSV import targets the user's portfolio
- **WHEN** an authenticated user posts a CSV preview
- **THEN** the `csv_imports` row is created with the user's portfolio id; no `Default` portfolio lookup runs

#### Scenario: Dashboard endpoints return only the user's data
- **WHEN** an authenticated user hits `/api/v1/dashboard/summary`
- **THEN** the response is filtered by RLS to the portfolios the user is a member of

### Requirement: Spanish UI for auth

The system SHALL show Spanish copy in the login form, the user menu, the auth error page, and any inline auth errors. The labels and messages MUST live in `src/lib/i18n/auth.ts` and be added to the dictionary.

#### Scenario: Login page in Spanish
- **WHEN** the user opens `/login`
- **THEN** the page shows a label "Correo electrónico", a button "Enviar enlace mágico", and a confirmation message "Te enviamos un enlace. Revisa tu bandeja de entrada."

#### Scenario: Auth error page in Spanish
- **WHEN** the user lands on `/auth/error`
- **THEN** the page shows a Spanish explanation and a link back to `/login`
