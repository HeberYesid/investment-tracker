-- 0010_asset_price_history.sql
-- Extends the market-data sync infrastructure to backfill historical
-- price rows per asset (used by the evolution chart to draw a smooth
-- line based on actual market prices instead of the latest trade price).
--
-- Changes:
--   1. market_sync_runs.kind CHECK is extended to allow
--      'PRICES_HISTORY'. The original constraint lives in
--      0004_market_data_sync.sql, which is immutable, so we drop and
--      re-add it here.
--   2. enqueue_sync_run is replaced with a version that has three
--      branches: PRICES, FX, and PRICES_HISTORY. The PRICES and FX
--      branches are byte-for-byte identical to 0005_sync_settings.sql.
--   3. A new pg_cron job `sync-asset-prices-history-daily` runs daily
--      at 00:30 UTC and enqueues a PRICES_HISTORY run. Wrapped in the
--      same do-$$-if-pg_cron-exists block so PGlite (schema test) can
--      still apply the migration.
--
-- Note: 0001_foundation.sql is immutable. Do not edit it; add new
-- migrations here instead.

-- ---------------------------------------------------------------------------
-- 1. Drop and re-add the CHECK on market_sync_runs.kind so it allows
--    'PRICES_HISTORY' alongside the original 'PRICES' and 'FX' values.
-- ---------------------------------------------------------------------------

alter table public.market_sync_runs
  drop constraint if exists market_sync_runs_kind_check;

alter table public.market_sync_runs
  add constraint market_sync_runs_kind_check
  check (kind in ('PRICES', 'FX', 'PRICES_HISTORY'));

-- ---------------------------------------------------------------------------
-- 2. enqueue_sync_run: keep PRICES and FX branches identical to
--    0005_sync_settings.sql; add a PRICES_HISTORY branch that posts to
--    /functions/v1/sync-asset-prices-history.
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
  v_anon_key text;
begin
  if p_kind not in ('PRICES', 'FX', 'PRICES_HISTORY') then
    raise exception 'enqueue_sync_run: invalid kind %, expected PRICES, FX, or PRICES_HISTORY', p_kind;
  end if;

  insert into public.market_sync_runs (kind, status)
  values (p_kind, 'PENDING')
  returning id into v_run_id;

  select value into v_edge_base
  from public.sync_settings
  where key = 'EDGE_FUNCTION_BASE';

  if v_edge_base is null or trim(v_edge_base) = '' then
    raise exception
      'enqueue_sync_run: missing sync_settings.EDGE_FUNCTION_BASE. '
      'Run: insert into public.sync_settings (key, value) values (''EDGE_FUNCTION_BASE'', ''https://<project-ref>.supabase.co'');';
  end if;

  select value into v_anon_key
  from public.sync_settings
  where key = 'SUPABASE_ANON_KEY';

  if v_anon_key is null or trim(v_anon_key) = '' then
    raise exception
      'enqueue_sync_run: missing sync_settings.SUPABASE_ANON_KEY. '
      'Run: insert into public.sync_settings (key, value) values (''SUPABASE_ANON_KEY'', ''<anon key from Supabase dashboard>'');';
  end if;

  if p_kind = 'PRICES' then
    perform net.http_post(
      url := v_edge_base || '/functions/v1/sync-prices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key
      ),
      body := jsonb_build_object('runId', v_run_id)
    );
  elsif p_kind = 'PRICES_HISTORY' then
    perform net.http_post(
      url := v_edge_base || '/functions/v1/sync-asset-prices-history',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key
      ),
      body := jsonb_build_object('runId', v_run_id)
    );
  else
    perform net.http_post(
      url := v_edge_base || '/functions/v1/sync-fx-rates',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key
      ),
      body := jsonb_build_object('runId', v_run_id)
    );
  end if;

  return v_run_id;
end;
$$;

grant execute on function public.enqueue_sync_run(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Daily cron for the asset price history backfill. Same pg_cron guard
--    pattern as 0004_market_data_sync.sql so PGlite can apply the
--    migration without the extension.
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
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'cron'
        and c.relname = 'job'
    ) then
      delete from cron.job
      where jobname = 'sync-asset-prices-history-daily';
    end if;

    perform cron.schedule(
      'sync-asset-prices-history-daily',
      '30 0 * * *',
      $cmd$ select public.enqueue_sync_run('PRICES_HISTORY'); $cmd$
    );
  end if;
end
$$;
