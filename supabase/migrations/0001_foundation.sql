create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  locale text not null default 'es',
  base_currency text not null default 'USD' check (base_currency in ('USD')),
  created_at timestamptz not null default now()
);

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  base_currency text not null default 'USD' check (base_currency in ('USD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolio_members (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER', 'EDITOR', 'VIEWER')),
  created_at timestamptz not null default now(),
  unique (portfolio_id, user_id)
);

create table public.brokers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  default_currency text not null check (default_currency in ('USD', 'COP')),
  is_active boolean not null default true
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  yahoo_symbol text,
  name text,
  asset_type text not null check (asset_type in ('STOCK', 'ETF', 'CRYPTO_FUTURE')),
  sector text,
  country text,
  currency text not null default 'USD' check (currency in ('USD', 'COP')),
  exchange text,
  unique (ticker, exchange)
);

create table public.csv_imports (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  broker_id uuid not null references public.brokers(id),
  file_name text not null,
  status text not null check (status in ('PREVIEWED', 'COMMITTED', 'FAILED')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  broker_id uuid not null references public.brokers(id),
  asset_id uuid not null references public.assets(id),
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
  source_file_id uuid references public.csv_imports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.csv_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.csv_imports(id) on delete cascade,
  row_number integer not null,
  raw_data_json jsonb not null,
  parsed_data_json jsonb,
  validation_status text not null check (validation_status in ('VALID', 'INVALID')),
  validation_error text
);

create table public.market_prices (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  price numeric(20, 8) not null,
  currency text not null check (currency in ('USD', 'COP')),
  price_usd numeric(20, 8) not null,
  source text not null,
  observed_at timestamptz not null,
  delayed_until timestamptz
);

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null check (from_currency in ('USD', 'COP')),
  to_currency text not null check (to_currency in ('USD', 'COP')),
  rate numeric(20, 8) not null,
  source text not null,
  observed_at timestamptz not null
);

create table public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  snapshot_date date not null,
  total_equity_usd numeric(20, 8) not null,
  invested_usd numeric(20, 8) not null,
  pnl_usd numeric(20, 8) not null,
  return_pct numeric(20, 8) not null,
  positions_json jsonb not null,
  unique (portfolio_id, snapshot_date)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  asset_id uuid references public.assets(id),
  alert_type text not null check (alert_type in ('PRICE_ABOVE', 'PRICE_BELOW', 'DIVIDEND', 'SIGNIFICANT_CHANGE_5')),
  threshold_value numeric(20, 8),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts(id) on delete cascade,
  triggered_at timestamptz not null default now(),
  payload_json jsonb not null,
  delivery_status text not null check (delivery_status in ('PENDING', 'SENT', 'FAILED'))
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('CREATE', 'UPDATE', 'DELETE', 'IMPORT')),
  before_json jsonb,
  after_json jsonb,
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index portfolios_user_id_idx on public.portfolios(user_id);
create index portfolio_members_portfolio_id_idx on public.portfolio_members(portfolio_id);
create index portfolio_members_user_id_idx on public.portfolio_members(user_id);
create index assets_ticker_idx on public.assets(ticker);
create index trades_portfolio_id_trade_date_idx on public.trades(portfolio_id, trade_date desc);
create index trades_asset_id_idx on public.trades(asset_id);
create index csv_imports_portfolio_id_idx on public.csv_imports(portfolio_id);
create index csv_import_rows_import_id_idx on public.csv_import_rows(import_id);
create index market_prices_asset_id_observed_at_idx on public.market_prices(asset_id, observed_at desc);
create index fx_rates_pair_observed_at_idx on public.fx_rates(from_currency, to_currency, observed_at desc);
create index portfolio_snapshots_portfolio_id_snapshot_date_idx on public.portfolio_snapshots(portfolio_id, snapshot_date desc);
create index alerts_portfolio_id_idx on public.alerts(portfolio_id);
create index alert_events_alert_id_idx on public.alert_events(alert_id);
create index audit_events_portfolio_id_created_at_idx on public.audit_events(portfolio_id, created_at desc);

insert into public.brokers (code, name, default_currency)
values
  ('ETORO', 'eToro', 'USD'),
  ('XTB', 'XTB', 'USD'),
  ('TRII', 'Trii', 'COP'),
  ('ETRADING_BANCOLOMBIA', 'eTrading Bancolombia', 'COP')
on conflict (code) do update
set name = excluded.name,
    default_currency = excluded.default_currency,
    is_active = true;

alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_members enable row level security;
alter table public.brokers enable row level security;
alter table public.assets enable row level security;
alter table public.trades enable row level security;
alter table public.csv_imports enable row level security;
alter table public.csv_import_rows enable row level security;
alter table public.market_prices enable row level security;
alter table public.fx_rates enable row level security;
alter table public.portfolio_snapshots enable row level security;
alter table public.alerts enable row level security;
alter table public.alert_events enable row level security;
alter table public.audit_events enable row level security;

grant select on public.brokers, public.assets, public.market_prices, public.fx_rates to anon, authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.portfolios,
  public.portfolio_members,
  public.trades,
  public.csv_imports,
  public.csv_import_rows,
  public.portfolio_snapshots,
  public.alerts,
  public.alert_events,
  public.audit_events
to authenticated;

create policy "reference brokers are readable"
on public.brokers for select
to anon, authenticated
using (true);

create policy "reference assets are readable"
on public.assets for select
to anon, authenticated
using (true);

create policy "market prices are readable"
on public.market_prices for select
to anon, authenticated
using (true);

create policy "fx rates are readable"
on public.fx_rates for select
to anon, authenticated
using (true);

create policy "users can read own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "users can update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "users can read owned portfolios"
on public.portfolios for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users can create owned portfolios"
on public.portfolios for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users can update owned portfolios"
on public.portfolios for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users can delete owned portfolios"
on public.portfolios for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "owners can read portfolio members"
on public.portfolio_members for select
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = portfolio_members.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "owners can manage portfolio members"
on public.portfolio_members for all
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = portfolio_members.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = portfolio_members.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "owners can manage trades"
on public.trades for all
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = trades.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = trades.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "owners can manage csv imports"
on public.csv_imports for all
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = csv_imports.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = csv_imports.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "owners can manage csv import rows"
on public.csv_import_rows for all
to authenticated
using (
  exists (
    select 1
    from public.csv_imports
    join public.portfolios on portfolios.id = csv_imports.portfolio_id
    where csv_imports.id = csv_import_rows.import_id
      and portfolios.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.csv_imports
    join public.portfolios on portfolios.id = csv_imports.portfolio_id
    where csv_imports.id = csv_import_rows.import_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "owners can read portfolio snapshots"
on public.portfolio_snapshots for select
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = portfolio_snapshots.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "owners can manage alerts"
on public.alerts for all
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = alerts.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = alerts.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "owners can read alert events"
on public.alert_events for select
to authenticated
using (
  exists (
    select 1
    from public.alerts
    join public.portfolios on portfolios.id = alerts.portfolio_id
    where alerts.id = alert_events.alert_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "owners can read audit events"
on public.audit_events for select
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = audit_events.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);
