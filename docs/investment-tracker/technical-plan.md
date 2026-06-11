# Investment Tracker Technical Plan

## Goal

Build a mobile-first web application for tracking investments across eToro, XTB, Trii, and eTrading Bancolombia with a USD base currency, CSV import, manual trade entry, consolidated analytics, and a strict USD 0 monthly operating cost target.

## Non-Negotiable Constraint: Free Operation

The application must run on free tiers for MVP and early V2/V3 usage:

- Vercel Hobby for hosting and Next.js server routes.
- Supabase Free for Postgres, Auth, Storage, and Edge Functions.
- Resend Free for email notifications.
- Yahoo Finance or another free market-data source through an internal adapter.
- Client-side export for PDF and Excel reports.
- Web Push API for push notifications, without paid notification providers.

The architecture must avoid vendor lock-in around free services. Any external provider must sit behind a local adapter interface so it can be replaced without changing business logic.

## Product Scope

### Brokers

- eToro, USD.
- XTB, USD.
- Trii, COP.
- eTrading Bancolombia, COP.

### Asset Types

- Stocks.
- ETFs.
- Crypto futures in V3.

### Base Currency

- USD.
- COP trades must be converted to USD using stored FX rates.
- In MVP, COP conversion can use manually provided or imported FX rates.
- In V2, COP to USD conversion becomes automatic through an `FxRateProvider`.

### MVP Features

- Spanish UI.
- Manual trade entry.
- CSV import for the four brokers.
- Consolidated dashboard with charts.
- Search, filter, edit, and delete trades.
- Full trade history with audit trail.

### V2 Features

- Login with users and portfolio permissions.
- Delayed price refresh from Yahoo Finance or a free provider.
- Automatic COP to USD conversion.
- Price alerts, dividend alerts, 5 percent movement alerts.
- Monthly email summary.

### V3 Features

- Installable PWA.
- Offline read support.
- Push notifications.
- Crypto futures support.
- Exportable PDF and Excel reports.
- Spanish and English UI.

## Tech Stack Decisions

### Frontend

- Next.js App Router with TypeScript.
- Tailwind CSS for styling.
- shadcn/ui for accessible UI primitives.
- Recharts for dashboard charts.
- React Hook Form plus Zod for forms.
- TanStack Query for server state.

### Backend

- Next.js Route Handlers for synchronous APIs.
- Supabase Edge Functions for scheduled and async work.
- Supabase Postgres as the system of record.
- Supabase Auth in V2.
- Supabase Row Level Security from the first database migration.

### Integrations

- `MarketDataProvider` for quotes and benchmark data.
- `FxRateProvider` for COP to USD conversion.
- `EmailProvider` for alerts and monthly summaries.
- `CsvBrokerParser` per broker.
- `ReportExporter` for client-side PDF and Excel generation.

## Database Schema

### Identity And Access

```sql
profiles (
  id uuid primary key references auth.users(id),
  full_name text,
  locale text not null default 'es',
  base_currency text not null default 'USD',
  created_at timestamptz not null default now()
);

portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  name text not null,
  base_currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

portfolio_members (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('OWNER', 'EDITOR', 'VIEWER')),
  created_at timestamptz not null default now(),
  unique (portfolio_id, user_id)
);
```

### Reference Data

```sql
brokers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  default_currency text not null check (default_currency in ('USD', 'COP')),
  is_active boolean not null default true
);

assets (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  yahoo_symbol text,
  name text,
  asset_type text not null check (asset_type in ('STOCK', 'ETF', 'CRYPTO_FUTURE')),
  sector text,
  country text,
  currency text not null default 'USD',
  exchange text,
  unique (ticker, exchange)
);
```

### Trades And Imports

```sql
trades (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id),
  broker_id uuid not null references brokers(id),
  asset_id uuid not null references assets(id),
  trade_date date not null,
  trade_type text not null check (trade_type in ('BUY', 'SELL', 'DIVIDEND', 'FEE', 'TRANSFER_IN', 'TRANSFER_OUT')),
  quantity numeric(20, 8) not null,
  price_original numeric(20, 8) not null,
  currency_original text not null check (currency_original in ('USD', 'COP')),
  commission_original numeric(20, 8) not null default 0,
  fx_rate_to_usd numeric(20, 8) not null default 1,
  price_usd numeric(20, 8) not null,
  commission_usd numeric(20, 8) not null default 0,
  total_invested_usd numeric(20, 8) not null,
  source text not null check (source in ('MANUAL', 'CSV')),
  source_file_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

csv_imports (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id),
  broker_id uuid not null references brokers(id),
  file_name text not null,
  status text not null check (status in ('PREVIEWED', 'COMMITTED', 'FAILED')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  created_at timestamptz not null default now()
);

csv_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references csv_imports(id),
  row_number integer not null,
  raw_data_json jsonb not null,
  parsed_data_json jsonb,
  validation_status text not null check (validation_status in ('VALID', 'INVALID')),
  validation_error text
);
```

### Market Data And Analytics

```sql
market_prices (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  price numeric(20, 8) not null,
  currency text not null,
  price_usd numeric(20, 8) not null,
  source text not null,
  observed_at timestamptz not null,
  delayed_until timestamptz
);

fx_rates (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null,
  to_currency text not null,
  rate numeric(20, 8) not null,
  source text not null,
  observed_at timestamptz not null
);

portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id),
  snapshot_date date not null,
  total_equity_usd numeric(20, 8) not null,
  invested_usd numeric(20, 8) not null,
  pnl_usd numeric(20, 8) not null,
  return_pct numeric(20, 8) not null,
  positions_json jsonb not null,
  unique (portfolio_id, snapshot_date)
);
```

### Alerts And Audit

```sql
alerts (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id),
  asset_id uuid references assets(id),
  alert_type text not null check (alert_type in ('PRICE_ABOVE', 'PRICE_BELOW', 'DIVIDEND', 'SIGNIFICANT_CHANGE_5')),
  threshold_value numeric(20, 8),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts(id),
  triggered_at timestamptz not null default now(),
  payload_json jsonb not null,
  delivery_status text not null check (delivery_status in ('PENDING', 'SENT', 'FAILED'))
);

audit_events (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('CREATE', 'UPDATE', 'DELETE', 'IMPORT')),
  before_json jsonb,
  after_json jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);
```

## API Architecture

All public app APIs live under `/api/v1`. Request and response contracts must be defined with Zod.

### Error Shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input.",
    "details": {}
  }
}
```

### Endpoints

```txt
GET    /api/v1/portfolios
POST   /api/v1/portfolios

GET    /api/v1/trades
POST   /api/v1/trades
PATCH  /api/v1/trades/:id
DELETE /api/v1/trades/:id

POST   /api/v1/imports/csv/preview
POST   /api/v1/imports/csv/commit
GET    /api/v1/imports/:id

GET    /api/v1/dashboard/summary
GET    /api/v1/dashboard/evolution
GET    /api/v1/dashboard/distribution
GET    /api/v1/dashboard/returns
GET    /api/v1/dashboard/drawdown

GET    /api/v1/assets/search
GET    /api/v1/prices

GET    /api/v1/alerts
POST   /api/v1/alerts
PATCH  /api/v1/alerts/:id
DELETE /api/v1/alerts/:id
```

### API Rules

- Validate external input only at boundaries.
- Paginate list endpoints from the beginning.
- Keep deletes soft for trades via `deleted_at`.
- Use `PATCH` for partial updates.
- Do not expose provider-specific quote fields to the frontend.
- CSV import must be previewed before commit.
- Destructive or bulk operations must create `audit_events`.

## Frontend Architecture

### Routes

```txt
/
/trades
/trades/new
/trades/[id]/edit
/import
/assets/[ticker]
/settings
/settings/members
/alerts
```

### Feature Modules

```txt
features/dashboard
features/trades
features/imports
features/assets
features/alerts
features/auth
shared/api
shared/components
shared/charts
shared/forms
shared/i18n
shared/utils
```

### UX Principles

- Mobile-first layout.
- Dashboard first, not marketing first.
- Fast trade entry is the primary workflow.
- CSV import must show row-level validation before writing to the database.
- Spanish copy in V1.
- i18n-ready structure from V1 to avoid a V3 rewrite.

## Project Structure

```txt
investment-tracker/
  app/
    api/v1/
    dashboard/
    trades/
    import/
    assets/[ticker]/
    settings/
    alerts/
  components/
    ui/
    layout/
    charts/
  features/
    dashboard/
    trades/
    imports/
    assets/
    alerts/
    auth/
  lib/
    supabase/
    market-data/
    csv/
    fx/
    calculations/
    validations/
  supabase/
    migrations/
    functions/
      sync-prices/
      evaluate-alerts/
      monthly-summary/
  tests/
    unit/
    integration/
    e2e/
```

## Implementation Phases

1. Phase 0: Foundation.
2. Phase 1: Trades MVP.
3. Phase 2: CSV Import MVP.
4. Phase 3: Dashboard MVP.
5. Phase 4: Auth And Permissions.
6. Phase 5: Market Data And FX.
7. Phase 6: Alerts And Monthly Summary.
8. Phase 7: PWA, Exports, Crypto, Bilingual.

Detailed phase plans are stored in `docs/investment-tracker/phases/`.

## Risk Register

- Free provider quotas can change. Mitigation: keep providers behind adapters and document limits.
- Yahoo Finance is not a guaranteed stable API contract. Mitigation: isolate it behind `MarketDataProvider`.
- Broker CSV formats can change. Mitigation: one parser per broker plus fixture-based parser tests.
- Supabase Free has a 500 MB database limit. Mitigation: avoid storing original CSV files and keep only normalized rows plus import errors.
- Scheduled jobs can exceed free function quotas if run too often. Mitigation: run price sync in batches and avoid per-user polling.
- Financial calculations can drift if not tested. Mitigation: unit-test position, cost basis, realized P/L, unrealized P/L, return, and drawdown calculations.

