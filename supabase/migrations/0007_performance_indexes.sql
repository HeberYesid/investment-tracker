-- 0007_performance_indexes.sql
-- Performance indexes and efficient latest-market-prices accessor.
--
-- Adds indexes on columns that are filtered by GET /api/v1/trades
-- (broker_id, trade_type, currency_original) and by the CSV commit
-- query on csv_import_rows (import_id, validation_status). Also
-- declares a SQL function get_latest_market_prices(p_asset_ids) that
-- returns at most one row per asset (the most recent non-delayed one)
-- using DISTINCT ON, replacing the previous approach of fetching the
-- full price history per asset and deduplicating in JavaScript.
--
-- RLS note: market_prices, assets, brokers and fx_rates have RLS
-- enabled with policies `using (true)` for anon/authenticated
-- (0001_foundation.sql:221-224). Market data is global, not user-
-- scoped, so this function and the asset-scoped unstable_cache in
-- the app layer are safe across users.

create index if not exists trades_broker_id_idx
  on public.trades (broker_id);

create index if not exists trades_trade_type_idx
  on public.trades (trade_type);

create index if not exists trades_currency_original_idx
  on public.trades (currency_original);

create index if not exists csv_import_rows_import_id_status_idx
  on public.csv_import_rows (import_id, validation_status);

create or replace function public.get_latest_market_prices(
  p_asset_ids uuid[]
)
returns table (
  asset_id uuid,
  price_usd numeric,
  observed_at timestamptz,
  delayed_until timestamptz
)
language sql
stable
as $$
  select distinct on (mp.asset_id)
    mp.asset_id,
    mp.price_usd,
    mp.observed_at,
    mp.delayed_until
  from public.market_prices mp
  where mp.asset_id = any(p_asset_ids)
    and (mp.delayed_until is null or mp.delayed_until <= now())
  order by mp.asset_id, mp.observed_at desc;
$$;

grant execute on function public.get_latest_market_prices(uuid[])
  to anon, authenticated;
