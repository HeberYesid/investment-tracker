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
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code or `NEXT_PUBLIC_` variables.

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
- Phase 1: trades MVP pending.
- Phase 2: CSV import MVP pending.
- Phase 3: dashboard MVP pending.
- Phase 4: auth and permissions pending.
- Phase 5: market data and FX pending.
- Phase 6: alerts and monthly summary pending.
- Phase 7: PWA, exports, crypto, and bilingual support pending.
