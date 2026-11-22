alter table public.market_sync_runs
  add column if not exists failed_assets jsonb;

comment on column public.market_sync_runs.failed_assets is
  'Private per-asset diagnostics for PRICES runs; never returned directly to app clients.';

drop function public.get_latest_market_prices(uuid[]);
create function public.get_latest_market_prices(p_asset_ids uuid[])
returns table (asset_id uuid, price_usd numeric, observed_at timestamptz, delayed_until timestamptz, source text)
language sql stable as $$
  select distinct on (mp.asset_id) mp.asset_id, mp.price_usd, mp.observed_at, mp.delayed_until, mp.source
  from public.market_prices mp
  where mp.asset_id = any(p_asset_ids)
    and (mp.delayed_until is null or mp.delayed_until <= now())
  order by mp.asset_id, mp.observed_at desc;
$$;
grant execute on function public.get_latest_market_prices(uuid[]) to anon, authenticated;
