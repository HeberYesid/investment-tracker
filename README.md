# Investment Tracker

Mobile-first web application for tracking investments across eToro, XTB, Trii, and eTrading Bancolombia with USD as base currency.

## Getting Started

Install dependencies and run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment

Copy `.env.example` to `.env.local` and fill in the Supabase values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code or `NEXT_PUBLIC_` variables.

## Authentication

Phase 4 wires up Supabase Auth with magic-link sign-in. The flow is:

1. User visits `/login` and submits an email.
2. Supabase sends a magic link with a `redirectTo` pointing at `${NEXT_PUBLIC_SITE_URL}/auth/callback?next=...`.
3. The callback route exchanges the code for a session, sets the auth cookies, and redirects.
4. A Next.js middleware (`src/middleware.ts`) protects every other route: unauthenticated page requests redirect to `/login`, unauthenticated API requests return `401 { error: { code: "UNAUTHORIZED", ... } }`.
5. On signup, a Postgres trigger creates a row in `public.profiles`, a default portfolio named `Mi portafolio`, and an `OWNER` row in `public.portfolio_members` for the new user.

To enable Auth in your Supabase project (one-time, manual):

1. **Authentication → Providers → Email**: leave enabled.
2. **Authentication → URL Configuration**:
   - Site URL: `${NEXT_PUBLIC_SITE_URL}`
   - Additional Redirect URLs: `${NEXT_PUBLIC_SITE_URL}/auth/callback`
3. **Authentication → Email Templates → Magic link**: customize the sender name if you want.
4. To drop any orphan portfolios left over from pre-auth MVP testing:
   ```sql
   delete from public.portfolios where user_id is null;
   ```

Application code never uses the service-role key for normal requests. It only exists for trusted server tasks (e.g. background jobs) and is exposed via `createServiceSupabaseClient()`. All Route Handlers and Server Components go through `createUserSupabaseClient()`, which is bound to the request cookies and therefore subject to RLS.

## Scripts

```bash
pnpm dev
pnpm lint
pnpm test:run
pnpm test:e2e
pnpm build
```

## Database

The foundation schema lives in `supabase/migrations/0001_foundation.sql`.

It creates the core investment tables, enables RLS on every public table, and seeds the four supported brokers:

- eToro, USD.
- XTB, USD.
- Trii, COP.
- eTrading Bancolombia, COP.

The migration smoke test uses PGlite to apply the schema DDL in memory and validate public tables, RLS, and broker seeds.

## Cost Guardrails

The project is designed to run at USD 0 monthly operating cost for MVP and early usage.

- Use Vercel Hobby for hosting.
- Use Supabase Free for Postgres, Auth, Storage, and Edge Functions.
- Keep CSV processing in memory and do not store original CSV files by default.
- Keep external providers behind adapters so paid replacements are optional.
- Use delayed/free market data only in V2.
- Use client-side exports for PDF and Excel in V3.
- Avoid paid cron, queue, analytics, email, and notification services.

## Phase Status

- Phase 0: foundation complete.
- Phase 1: trades MVP complete.
- Phase 2: CSV import MVP complete.
- Phase 3: dashboard MVP complete.
- Phase 4: auth and permissions complete (OWNER-only; members UI deferred to 4.1).
- Phase 5: market data and FX pending.
- Phase 6: alerts and monthly summary pending.
- Phase 7: PWA, exports, crypto, and bilingual support pending.
