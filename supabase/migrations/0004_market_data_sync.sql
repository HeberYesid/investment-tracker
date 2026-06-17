-- 0004_market_data_sync.sql
-- Adds the market-data infrastructure for Phase 5:
--   1. S&P 500 benchmark asset row (treated like any other asset).
--   2. market_sync_runs table for tracking Edge Function runs.
--   3. enqueue_sync_run SQL function that records a run, then calls the
--      matching Edge Function via net.http_post.
--   4. pg_cron schedules that call enqueue_sync_run on a cadence.
--
-- The cron + net side is wrapped so PGlite (schema test) can still apply
-- the migration: it only kicks in when the cron schema + cron.schedule
-- function are present, which they are on Supabase but not in PGlite.
--
-- Settings required per environment (do NOT commit real values):
--   alter database postgres set app.edge_function_base
--     = 'https://<project-ref>.functions.supabase.co';
--   alter database postgres set app.service_role_key
--     = '<service-role key from SUPABASE_SERVICE_ROLE_KEY>';

-- ---------------------------------------------------------------------------
-- 1. Benchmark asset: S&P 500 index. Both ticker and yahoo_symbol are
--    '^GSPC' so the snapshot loader can resolve the asset by either
--    column.
-- ---------------------------------------------------------------------------

insert into public.assets (
  ticker,
  yahoo_symbol,
  name,
  asset_type,
  sector,
  country,
  currency,
  exchange
) values (
  '^GSPC',
  '^GSPC',
  'S&P 500',
  'ETF',
  null,
  'US',
  'USD',
  'INDEX'
) on conflict (ticker, exchange) do update
set yahoo_symbol = excluded.yahoo_symbol,
    name = excluded.name,
    asset_type = excluded.asset_type,
    currency = excluded.currency,
    exchange = excluded.exchange;

-- ---------------------------------------------------------------------------
-- 2. Sync-run observability. RLS is enabled but no policies are granted,
--    so only the service role can read or write (D7 in design.md).
-- ---------------------------------------------------------------------------

create table if not exists public.market_sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('PRICES', 'FX')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED')),
  assets_processed integer,
  error text
);

alter table public.market_sync_runs enable row level security;

-- ---------------------------------------------------------------------------
-- 3. enqueue_sync_run: insert a PENDING row, then fire the Edge Function.
--    Returns the run id. Called by the cron schedules below AND by the
--    admin "Sincronizar ahora" endpoint.
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_sync_run(p_kind text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_edge_base text;
  v_service_key text;
begin
  if p_kind not in ('PRICES', 'FX') then
    raise exception 'enqueue_sync_run: invalid kind %, expected PRICES or FX', p_kind;
  end if;

  insert into public.market_sync_runs (kind, status)
  values (p_kind, 'PENDING')
  returning id into v_run_id;

  v_edge_base := current_setting('app.edge_function_base', true);
  v_service_key := current_setting('app.service_role_key', true);

  if p_kind = 'PRICES' then
    perform net.http_post(
      url := v_edge_base || '/functions/v1/sync-prices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object('runId', v_run_id)
    );
  else
    perform net.http_post(
      url := v_edge_base || '/functions/v1/sync-fx-rates',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object('runId', v_run_id)
    );
  end if;

  return v_run_id;
end;
$$;

grant execute on function public.enqueue_sync_run(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Cron schedules. Wrapped so the test environment (PGlite) can apply
--    the migration even though it has no pg_cron.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'cron'
      and p.proname = 'schedule'
  ) then
    -- Unschedule any prior versions of these jobs (idempotent re-runs).
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'cron'
        and c.relname = 'job'
    ) then
      delete from cron.job
      where jobname in ('sync-prices-30m', 'sync-fx-rates-daily');
    end if;

    perform cron.schedule(
      'sync-prices-30m',
      '*/30 * * * *',
      $cmd$ select public.enqueue_sync_run('PRICES'); $cmd$
    );

    perform cron.schedule(
      'sync-fx-rates-daily',
      '0 6 * * *',
      $cmd$ select public.enqueue_sync_run('FX'); $cmd$
    );
  end if;
end
$$;
