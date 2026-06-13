-- 0003_auth_and_permissions.sql
-- Activates Supabase Auth + portfolio ownership via portfolio_members.
-- Replaces owner-style policies (0001) with membership-aware policies
-- so that RLS actually filters rows once the app stops using the
-- service role key. Run after 0001 and 0002.

-- ---------------------------------------------------------------------------
-- 1. Trigger: provision profile + default portfolio + OWNER membership
--    for every new auth.users row. SECURITY DEFINER + fixed search_path
--    so it bypasses RLS safely and is not vulnerable to search_path hijack.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_portfolio_id uuid;
begin
  insert into public.profiles (id, full_name, locale, base_currency)
  values (new.id, null, 'es', 'USD')
  on conflict (id) do nothing;

  insert into public.portfolios (user_id, name, base_currency)
  values (new.id, 'Mi portafolio', 'USD')
  returning id into new_portfolio_id;

  insert into public.portfolio_members (portfolio_id, user_id, role)
  values (new_portfolio_id, new.id, 'OWNER')
  on conflict (portfolio_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Helper functions used by RLS policies.
--    SECURITY DEFINER so the caller (with TO authenticated) can run them
--    without needing direct grants on portfolio_members. STABLE because
--    the result depends only on auth.uid() and the rows.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_is_member(p_portfolio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portfolio_members
    where portfolio_id = p_portfolio_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.current_user_has_role(p_portfolio_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portfolio_members
    where portfolio_id = p_portfolio_id
      and user_id = auth.uid()
      and role = p_role
  );
$$;

grant execute on function public.current_user_is_member(uuid) to authenticated;
grant execute on function public.current_user_has_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Drop the owner-style policies from 0001 so we can replace them.
--    They are recreated below with membership-aware checks.
-- ---------------------------------------------------------------------------

drop policy if exists "users can read owned portfolios" on public.portfolios;
drop policy if exists "users can update owned portfolios" on public.portfolios;
drop policy if exists "users can delete owned portfolios" on public.portfolios;

drop policy if exists "owners can read portfolio members" on public.portfolio_members;
drop policy if exists "owners can manage portfolio members" on public.portfolio_members;

drop policy if exists "owners can manage trades" on public.trades;
drop policy if exists "owners can manage csv imports" on public.csv_imports;
drop policy if exists "owners can manage csv import rows" on public.csv_import_rows;
drop policy if exists "owners can read portfolio snapshots" on public.portfolio_snapshots;
drop policy if exists "owners can manage alerts" on public.alerts;
drop policy if exists "owners can read alert events" on public.alert_events;
drop policy if exists "owners can read audit events" on public.audit_events;

-- "users can create owned portfolios" stays (it inserts where
-- auth.uid() = user_id, which is still correct for a new portfolio).

-- ---------------------------------------------------------------------------
-- 4. Recreate policies using portfolio_members helpers.
--    Scope: SELECT for any member, write (INSERT/UPDATE/DELETE) for OWNER.
-- ---------------------------------------------------------------------------

-- portfolios
create policy "members can read portfolios"
on public.portfolios for select
to authenticated
using (public.current_user_is_member(id));

create policy "owners can update portfolios"
on public.portfolios for update
to authenticated
using (public.current_user_has_role(id, 'OWNER'))
with check (public.current_user_has_role(id, 'OWNER'));

create policy "owners can delete portfolios"
on public.portfolios for delete
to authenticated
using (public.current_user_has_role(id, 'OWNER'));

-- portfolio_members: OWNER-only on every operation
create policy "owners can read portfolio members"
on public.portfolio_members for select
to authenticated
using (public.current_user_has_role(portfolio_id, 'OWNER'));

create policy "owners can insert portfolio members"
on public.portfolio_members for insert
to authenticated
with check (public.current_user_has_role(portfolio_id, 'OWNER'));

create policy "owners can update portfolio members"
on public.portfolio_members for update
to authenticated
using (public.current_user_has_role(portfolio_id, 'OWNER'))
with check (public.current_user_has_role(portfolio_id, 'OWNER'));

create policy "owners can delete portfolio members"
on public.portfolio_members for delete
to authenticated
using (public.current_user_has_role(portfolio_id, 'OWNER'));

-- trades
create policy "members can read trades"
on public.trades for select
to authenticated
using (public.current_user_is_member(portfolio_id));

create policy "owners can insert trades"
on public.trades for insert
to authenticated
with check (public.current_user_has_role(portfolio_id, 'OWNER'));

create policy "owners can update trades"
on public.trades for update
to authenticated
using (public.current_user_has_role(portfolio_id, 'OWNER'))
with check (public.current_user_has_role(portfolio_id, 'OWNER'));

create policy "owners can delete trades"
on public.trades for delete
to authenticated
using (public.current_user_has_role(portfolio_id, 'OWNER'));

-- csv_imports
create policy "members can read csv imports"
on public.csv_imports for select
to authenticated
using (public.current_user_is_member(portfolio_id));

create policy "owners can insert csv imports"
on public.csv_imports for insert
to authenticated
with check (public.current_user_has_role(portfolio_id, 'OWNER'));

create policy "owners can update csv imports"
on public.csv_imports for update
to authenticated
using (public.current_user_has_role(portfolio_id, 'OWNER'))
with check (public.current_user_has_role(portfolio_id, 'OWNER'));

create policy "owners can delete csv imports"
on public.csv_imports for delete
to authenticated
using (public.current_user_has_role(portfolio_id, 'OWNER'));

-- csv_import_rows: scope through csv_imports.portfolio_id
create policy "members can read csv import rows"
on public.csv_import_rows for select
to authenticated
using (
  exists (
    select 1
    from public.csv_imports
    where csv_imports.id = csv_import_rows.import_id
      and public.current_user_is_member(csv_imports.portfolio_id)
  )
);

create policy "owners can insert csv import rows"
on public.csv_import_rows for insert
to authenticated
with check (
  exists (
    select 1
    from public.csv_imports
    where csv_imports.id = csv_import_rows.import_id
      and public.current_user_has_role(csv_imports.portfolio_id, 'OWNER')
  )
);

create policy "owners can update csv import rows"
on public.csv_import_rows for update
to authenticated
using (
  exists (
    select 1
    from public.csv_imports
    where csv_imports.id = csv_import_rows.import_id
      and public.current_user_has_role(csv_imports.portfolio_id, 'OWNER')
  )
)
with check (
  exists (
    select 1
    from public.csv_imports
    where csv_imports.id = csv_import_rows.import_id
      and public.current_user_has_role(csv_imports.portfolio_id, 'OWNER')
  )
);

create policy "owners can delete csv import rows"
on public.csv_import_rows for delete
to authenticated
using (
  exists (
    select 1
    from public.csv_imports
    where csv_imports.id = csv_import_rows.import_id
      and public.current_user_has_role(csv_imports.portfolio_id, 'OWNER')
  )
);

-- portfolio_snapshots
create policy "members can read portfolio snapshots"
on public.portfolio_snapshots for select
to authenticated
using (public.current_user_is_member(portfolio_id));

create policy "owners can insert portfolio snapshots"
on public.portfolio_snapshots for insert
to authenticated
with check (public.current_user_has_role(portfolio_id, 'OWNER'));

create policy "owners can update portfolio snapshots"
on public.portfolio_snapshots for update
to authenticated
using (public.current_user_has_role(portfolio_id, 'OWNER'))
with check (public.current_user_has_role(portfolio_id, 'OWNER'));

create policy "owners can delete portfolio snapshots"
on public.portfolio_snapshots for delete
to authenticated
using (public.current_user_has_role(portfolio_id, 'OWNER'));

-- alerts
create policy "members can read alerts"
on public.alerts for select
to authenticated
using (public.current_user_is_member(portfolio_id));

create policy "owners can insert alerts"
on public.alerts for insert
to authenticated
with check (public.current_user_has_role(portfolio_id, 'OWNER'));

create policy "owners can update alerts"
on public.alerts for update
to authenticated
using (public.current_user_has_role(portfolio_id, 'OWNER'))
with check (public.current_user_has_role(portfolio_id, 'OWNER'));

create policy "owners can delete alerts"
on public.alerts for delete
to authenticated
using (public.current_user_has_role(portfolio_id, 'OWNER'));

-- alert_events: scope through alerts.portfolio_id
create policy "members can read alert events"
on public.alert_events for select
to authenticated
using (
  exists (
    select 1
    from public.alerts
    where alerts.id = alert_events.alert_id
      and public.current_user_is_member(alerts.portfolio_id)
  )
);

-- audit_events
create policy "members can read audit events"
on public.audit_events for select
to authenticated
using (public.current_user_is_member(portfolio_id));

create policy "owners can insert audit events"
on public.audit_events for insert
to authenticated
with check (public.current_user_has_role(portfolio_id, 'OWNER'));

-- profiles: existing policies remain (user can read/update only own row).
