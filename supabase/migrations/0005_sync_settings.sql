-- 0005_sync_settings.sql
-- Replaces the previous current_setting-based configuration used by
-- enqueue_sync_run with a regular table. Supabase Free does not allow
-- ALTER DATABASE ... SET for custom parameters from the SQL Editor role.
--
-- After applying this migration, insert two rows once per environment
-- (do NOT commit real values):
--
--   insert into public.sync_settings (key, value) values
--     ('EDGE_FUNCTION_BASE', 'https://<project-ref>.supabase.co'),
--     ('SUPABASE_ANON_KEY', '<anon/publishable key from Supabase dashboard>');

-- ---------------------------------------------------------------------------
-- 1. Sync settings table. Only service_role can read/write because RLS is
--    enabled and no policies are granted.
-- ---------------------------------------------------------------------------

create table if not exists public.sync_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.sync_settings enable row level security;

comment on table public.sync_settings is
  'Internal sync configuration. Required keys: EDGE_FUNCTION_BASE, SUPABASE_ANON_KEY.';

-- ---------------------------------------------------------------------------
-- 2. enqueue_sync_run reads the Edge Function base URL and the anon key from
--    sync_settings. Supabase Edge Functions require a Bearer JWT in the
--    Authorization header; the anon (publishable) key is safe to store here.
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
  if p_kind not in ('PRICES', 'FX') then
    raise exception 'enqueue_sync_run: invalid kind %, expected PRICES or FX', p_kind;
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
