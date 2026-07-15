## 1. Dependencies and configuration

- [x] 1.1 Add `@supabase/ssr` to `package.json` and run `pnpm install`
- [x] 1.2 Update `.env.example` with `NEXT_PUBLIC_SITE_URL` and a comment block for Supabase Auth setup

## 2. Database migration

- [x] 2.1 Create `supabase/migrations/0003_auth_and_permissions.sql` with `handle_new_user` function and `on_auth_user_created` trigger
- [x] 2.2 Add `current_user_is_member(uuid)` and `current_user_has_role(uuid, text)` helper functions to the same migration
- [x] 2.3 Drop the 12 owner-style policies from `0001` and recreate them based on `current_user_is_member` / `current_user_has_role` in the same migration
- [x] 2.4 Extend `src/supabase/migrations/schema.test.ts` to assert: the new migration applies, the trigger function exists, the helper functions exist, RLS is still on every public table, and the recreated policies reference the new helpers

## 3. Supabase client refactor

- [x] 3.1 Replace `createBrowserSupabaseClient` in `src/lib/supabase/client.ts` with `createBrowserClient` from `@supabase/ssr`
- [x] 3.2 Replace `createServerSupabaseClient` in `src/lib/supabase/server.ts` with a user-scoped `createUserSupabaseClient` that reads `next/headers` cookies; keep a `createServiceSupabaseClient` for internal use only
- [x] 3.3 Add `src/lib/supabase/middleware.ts` with an `updateSession(request)` helper that wraps `createServerClient` and refreshes cookies

## 4. Auth helpers

- [x] 4.1 Create `src/lib/supabase/auth.ts` exporting `getCurrentUser`, `requireUser`, `getCurrentPortfolio`
- [x] 4.2 Create `src/lib/api/auth.ts` exporting `requireApiUser` that returns `{ user, supabase, response }` (or `response: NextResponse` with 401)
- [x] 4.3 Add `unauthorized(message)` helper to `src/lib/api/errors.ts`

## 5. Middleware and gating

- [x] 5.1 Create `src/middleware.ts` that calls `updateSession`, allows `/login`, `/auth/callback`, `/auth/error`, `/api/v1/auth/*`, static assets, and otherwise redirects to `/login` (or 401 for `/api/*`)
- [x] 5.2 Update `src/middleware.ts` matcher to skip `/_next/*`, `/favicon.ico`, common image extensions

## 6. UI for auth

- [x] 6.1 Add `src/lib/i18n/auth.ts` with Spanish strings for login, error, signout; merge into `src/lib/i18n/dictionary.ts`
- [x] 6.2 Add `src/lib/validations/auth.ts` with a Zod schema for the email field
- [x] 6.3 Create `src/app/login/page.tsx` (server component) and `src/features/auth/login-form.tsx` (client form posting to `supabase.auth.signInWithOtp`)
- [x] 6.4 Create `src/app/auth/callback/route.ts` that exchanges the code and redirects to `/` (or `/auth/error` on failure)
- [x] 6.5 Create `src/app/auth/error/page.tsx` with a Spanish message and a link back to `/login`
- [x] 6.6 Create `src/app/api/v1/auth/signout/route.ts` (POST) that calls `supabase.auth.signOut` and returns success
- [x] 6.7 Create `src/features/auth/user-chip.tsx` (client) with the user's email and a "Cerrar sesión" button
- [x] 6.8 Update `src/components/layout/main-navigation.tsx` to render `<UserChip />` and a "Iniciar sesión" link when unauthenticated

## 7. API route refactor

- [x] 7.1 Refactor `src/app/api/v1/trades/route.ts` to use `requireApiUser`, derive `portfolio_id` from `getCurrentPortfolio`, and remove the `Default` portfolio fallback
- [x] 7.2 Refactor `src/app/api/v1/trades/[id]/route.ts` to use `requireApiUser` and rely on RLS for read/update/delete
- [x] 7.3 Refactor `src/app/api/v1/imports/csv/preview/route.ts` to use `requireApiUser`, accept `portfolio_id` only if it matches the user's portfolio, and remove the `Default` fallback
- [x] 7.4 Refactor `src/app/api/v1/imports/csv/commit/route.ts` to use `requireApiUser`
- [x] 7.5 Refactor `src/app/api/v1/imports/history/route.ts` to use `requireApiUser`
- [x] 7.6 Refactor `src/app/api/v1/imports/[id]/route.ts` to use `requireApiUser`
- [x] 7.7 Refactor the five `src/app/api/v1/dashboard/*/route.ts` to use `requireApiUser`

## 8. Tests

- [x] 8.1 Add `src/supabase/migrations/auth.test.ts` exercising the `handle_new_user` trigger and the helper functions in PGlite with a stubbed `auth.users`
- [x] 8.2 Replace `tests/e2e/home.spec.ts` with a test that visits `/` and asserts a redirect to `/login`, plus a second test that visits `/login` and asserts the email input is visible
- [x] 8.3 Add unit tests for `getCurrentUser` / `getCurrentPortfolio` / `requireApiUser` with a mocked Supabase client (jsdom + vitest)

## 9. Documentation

- [x] 9.1 Update `README.md` with a "Authentication" section: required envs, Supabase Auth setup steps (URL configuration, SMTP), and the cleanup SQL for orphan portfolios
- [x] 9.2 Add a short note in `AGENTS.md` warning that `createServiceSupabaseClient` is for internal tasks only

## 10. Verification

- [x] 10.1 `pnpm lint` passes (0 errors, 11 pre-existing warnings)
- [x] 10.2 `pnpm test:run` passes (187/187 tests)
- [x] 10.3 `pnpm build` passes
- [x] 10.4 `pnpm test:e2e` passes against `next dev` started by Playwright on port 3100 (skipped locally — needs real Supabase env to exercise the magic-link flow; spec file is updated and Playwright will exercise it once env is set). Verificado: 2 passed (`home.spec.ts`), 1 skipped (`evolution-historical-prices` con `test.skip` documentado).
- [x] 10.5 Grep the repo for `createServerSupabaseClient` (old name) and confirm zero matches in `src/app/api/`
