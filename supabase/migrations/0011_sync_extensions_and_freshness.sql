-- 0011_sync_extensions_and_freshness.sql
-- Enables pg_cron and pg_net extensions (gated), re-schedules all cron
-- jobs idempotently, adds dedupe to enqueue_sync_run so rapid re-triggers
-- don't hammer Yahoo / open.er-api, and exposes market data freshness
-- via a security-definer SQL function readable by authenticated users.

-- ---------------------------------------------------------------------------
-- 1. Enable pg_cron + pg_net extensions, guarded by pg_available_extensions
--    so PGlite (schema test) can still apply the migration.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_available_extensions where name = 'pg_cron'
  ) then
    create extension if not exists pg_cron with schema extensions;
  end if;

  if exists (
    select 1 from pg_available_extensions where name = 'pg_net'
  ) then
    create extension if not exists pg_net with schema extensions;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Re-schedule the three cron jobs (idempotent delete + schedule pattern).
--    The DO block detects pg_cron the same way 0004 and 0010 do, so PGlite
--    applies the migration without the extension.
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
      begin
        perform cron.unschedule('sync-prices-30m');
      exception when others then
        -- job may not exist yet; that's fine
      end;
      begin
        perform cron.unschedule('sync-fx-rates-daily');
      exception when others then
      end;
      begin
        perform cron.unschedule('sync-asset-prices-history-daily');
      exception when others then
      end;
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

    perform cron.schedule(
      'sync-asset-prices-history-daily',
      '30 0 * * *',
      $cmd$ select public.enqueue_sync_run('PRICES_HISTORY'); $cmd$
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. enqueue_sync_run with dedupe.
--    Before inserting a new PENDING row, check for an existing PENDING or
--    RUNNING row of the same kind created within the last 5 minutes. If one
--    exists, return its id without firing another net.http_post. The three
--    branches (PRICES, PRICES_HISTORY, FX) are identical to 0010.
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

  select id into v_run_id
  from public.market_sync_runs
  where kind = p_kind
    and status in ('PENDING', 'RUNNING')
    and started_at > now() - interval '5 minutes'
  order by started_at desc
  limit 1;

  if v_run_id is not null then
    return v_run_id;
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
-- 4. Market data freshness helper (bypasses RLS via security definer).
--    Returns three columns: the most recent market price observed_at, the
--    most recent sync start that is still PENDING or RUNNING, and the most
--    recent successful sync completion. Authenticated users can call it so
--    RSC can use the user client (no service client in src/app/).
-- ---------------------------------------------------------------------------

create or replace function public.get_market_data_freshness()
returns table(
  latest_price_observed_at timestamptz,
  last_sync_started_at timestamptz,
  last_sync_finished_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    (select max(observed_at) from public.market_prices) as latest_price_observed_at,
    (select max(started_at)
     from public.market_sync_runs
     where kind = 'PRICES'
       and status in ('PENDING', 'RUNNING')) as last_sync_started_at,
    (select max(finished_at)
     from public.market_sync_runs
     where kind = 'PRICES'
       and status = 'SUCCESS') as last_sync_finished_at;
$$;

grant execute on function public.get_market_data_freshness() to authenticated;
