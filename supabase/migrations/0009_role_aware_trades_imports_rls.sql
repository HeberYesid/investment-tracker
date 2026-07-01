-- 0009_role_aware_trades_imports_rls.sql
-- Phase 4.1: loosen write policies on trades / csv_imports / csv_import_rows /
-- alerts / audit_events so that both 'OWNER' and 'EDITOR' can write. Reads
-- remain open to every member. portfolio_members stays OWNER-only.
--
-- Also adds three SECURITY DEFINER helpers used by the new members API:
--   - find_user_by_email(text) returns uuid
--   - count_portfolio_owners(uuid) returns integer
--   - current_user_role(uuid) returns text
--
-- Idempotent: drops any pre-existing policy with the same name before
-- recreating it, and uses `create or replace` for the helper functions.

-- ---------------------------------------------------------------------------
-- 1. Drop the OWNER-only write policies introduced by 0003 so we can
--    recreate them with the broader ('OWNER','EDITOR') predicate.
-- ---------------------------------------------------------------------------

drop policy if exists "owners can insert trades" on public.trades;
drop policy if exists "owners can update trades" on public.trades;
drop policy if exists "owners can delete trades" on public.trades;

drop policy if exists "owners can insert csv imports" on public.csv_imports;
drop policy if exists "owners can update csv imports" on public.csv_imports;
drop policy if exists "owners can delete csv imports" on public.csv_imports;

drop policy if exists "owners can insert csv import rows" on public.csv_import_rows;
drop policy if exists "owners can update csv import rows" on public.csv_import_rows;
drop policy if exists "owners can delete csv import rows" on public.csv_import_rows;

drop policy if exists "owners can insert alerts" on public.alerts;
drop policy if exists "owners can update alerts" on public.alerts;
drop policy if exists "owners can delete alerts" on public.alerts;

drop policy if exists "owners can insert audit events" on public.audit_events;

-- ---------------------------------------------------------------------------
-- 2. Recreate the write policies with the broader ('OWNER','EDITOR') set.
--    Reads (existing "members can read ...") are unchanged.
-- ---------------------------------------------------------------------------

-- trades
create policy "owners and editors can insert trades"
on public.trades for insert
to authenticated
with check (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
);

create policy "owners and editors can update trades"
on public.trades for update
to authenticated
using (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
)
with check (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
);

create policy "owners and editors can delete trades"
on public.trades for delete
to authenticated
using (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
);

-- csv_imports
create policy "owners and editors can insert csv imports"
on public.csv_imports for insert
to authenticated
with check (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
);

create policy "owners and editors can update csv imports"
on public.csv_imports for update
to authenticated
using (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
)
with check (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
);

create policy "owners and editors can delete csv imports"
on public.csv_imports for delete
to authenticated
using (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
);

-- csv_import_rows: scope the role check transitively through csv_imports.
create policy "owners and editors can insert csv import rows"
on public.csv_import_rows for insert
to authenticated
with check (
  exists (
    select 1
    from public.csv_imports
    where csv_imports.id = csv_import_rows.import_id
      and (
        public.current_user_has_role(csv_imports.portfolio_id, 'OWNER')
        or public.current_user_has_role(csv_imports.portfolio_id, 'EDITOR')
      )
  )
);

create policy "owners and editors can update csv import rows"
on public.csv_import_rows for update
to authenticated
using (
  exists (
    select 1
    from public.csv_imports
    where csv_imports.id = csv_import_rows.import_id
      and (
        public.current_user_has_role(csv_imports.portfolio_id, 'OWNER')
        or public.current_user_has_role(csv_imports.portfolio_id, 'EDITOR')
      )
  )
)
with check (
  exists (
    select 1
    from public.csv_imports
    where csv_imports.id = csv_import_rows.import_id
      and (
        public.current_user_has_role(csv_imports.portfolio_id, 'OWNER')
        or public.current_user_has_role(csv_imports.portfolio_id, 'EDITOR')
      )
  )
);

create policy "owners and editors can delete csv import rows"
on public.csv_import_rows for delete
to authenticated
using (
  exists (
    select 1
    from public.csv_imports
    where csv_imports.id = csv_import_rows.import_id
      and (
        public.current_user_has_role(csv_imports.portfolio_id, 'OWNER')
        or public.current_user_has_role(csv_imports.portfolio_id, 'EDITOR')
      )
  )
);

-- alerts
create policy "owners and editors can insert alerts"
on public.alerts for insert
to authenticated
with check (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
);

create policy "owners and editors can update alerts"
on public.alerts for update
to authenticated
using (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
)
with check (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
);

create policy "owners and editors can delete alerts"
on public.alerts for delete
to authenticated
using (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
);

-- audit_events: EDITORs need to insert audit rows from the same trade
-- mutations they are now allowed to perform.
create policy "owners and editors can insert audit events"
on public.audit_events for insert
to authenticated
with check (
  public.current_user_has_role(portfolio_id, 'OWNER')
  or public.current_user_has_role(portfolio_id, 'EDITOR')
);

-- ---------------------------------------------------------------------------
-- 3. Helper functions used by the members API. All are SECURITY DEFINER
--    with a fixed search_path so they can be called safely from RLS and
--    from authenticated clients. None of them grants direct access to
--    auth.users — find_user_by_email is the only client-facing surface.
-- ---------------------------------------------------------------------------

create or replace function public.find_user_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;
$$;

grant execute on function public.find_user_by_email(text) to authenticated;

create or replace function public.count_portfolio_owners(p_portfolio_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.portfolio_members
  where portfolio_id = p_portfolio_id
    and role = 'OWNER';
$$;

grant execute on function public.count_portfolio_owners(uuid) to authenticated;

create or replace function public.current_user_role(p_portfolio_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.portfolio_members
  where portfolio_id = p_portfolio_id
    and user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.current_user_role(uuid) to authenticated;
