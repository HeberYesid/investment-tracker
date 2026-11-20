-- 0014_secure_portfolio_memberships.sql

create or replace function public.list_my_portfolio_memberships()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'portfolio_id', p.id, 'name', p.name, 'base_currency', p.base_currency, 'role', m.role
    ) order by p.created_at, p.id
  ), '[]'::jsonb)
  from public.portfolio_members as m
  join public.portfolios as p on p.id = m.portfolio_id
  where m.user_id = (select auth.uid());
$$;

create or replace function public.list_portfolio_members(p_portfolio_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if not public.current_user_has_role(p_portfolio_id, 'OWNER') then
    raise exception using errcode = '42501', message = 'portfolio_members_forbidden';
  end if;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object('user_id', m.user_id, 'role', m.role, 'created_at', m.created_at, 'email', u.email)
      order by m.created_at, m.user_id
    ), '[]'::jsonb)
    from public.portfolio_members as m
    left join auth.users as u on u.id = m.user_id
    where m.portfolio_id = p_portfolio_id
  );
end;
$$;

revoke all on function public.list_my_portfolio_memberships(), public.list_portfolio_members(uuid)
  from public, anon, authenticated, service_role cascade;
grant execute on function public.list_my_portfolio_memberships(), public.list_portfolio_members(uuid)
  to authenticated;

create or replace function public.touch_portfolio_membership_parent(p_portfolio_id uuid)
returns boolean
language plpgsql
volatile
set search_path = pg_catalog, pg_temp
as $$
begin
  -- Escribe una nueva versión sin cambiar el timestamp visible ni bloquear la clave para las FK.
  update public.portfolios as p set updated_at = p.updated_at where p.id = p_portfolio_id;
  return found;
end;
$$;

create or replace function public.lock_portfolio_for_member_admin(p_portfolio_id uuid)
returns void
language plpgsql
volatile
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_portfolio_id is null then
    raise exception using errcode = '22023', message = 'portfolio_members_invalid_input';
  end if;

  if not public.current_user_has_role(p_portfolio_id, 'OWNER') then
    raise exception using errcode = '42501', message = 'portfolio_members_forbidden';
  end if;
  if not public.touch_portfolio_membership_parent(p_portfolio_id) then
    raise exception using errcode = '42501', message = 'portfolio_members_forbidden';
  end if;

  -- En READ COMMITTED esta sentencia ve el estado tras la escritura; con snapshot fijo la escritura puede abortar.
  if not public.current_user_has_role(p_portfolio_id, 'OWNER') then
    raise exception using errcode = '42501', message = 'portfolio_members_forbidden';
  end if;
end;
$$;

create or replace function public.assert_portfolio_has_owner(p_portfolio_id uuid)
returns void
language plpgsql
volatile
set search_path = pg_catalog, pg_temp
as $$
begin
  if exists (select 1 from public.portfolios as p where p.id = p_portfolio_id)
     and not exists (
       select 1 from public.portfolio_members as m where m.portfolio_id = p_portfolio_id and m.role = 'OWNER'
     ) then
    raise exception using errcode = 'PM001', message = 'portfolio_members_last_owner';
  end if;
end;
$$;

create or replace function public.invite_portfolio_member(p_portfolio_id uuid, p_email text, p_role text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_email text;
  v_user_id uuid;
  v_current_email text;
  v_member jsonb;
begin
  perform public.lock_portfolio_for_member_admin(p_portfolio_id);

  v_email := lower(regexp_replace(p_email, '^[[:space:]]+|[[:space:]]+$', '', 'g'));
  if p_role is null or p_role not in ('EDITOR', 'VIEWER')
     or v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = '22023', message = 'portfolio_members_invalid_input';
  end if;

  begin
    select u.id, u.email into strict v_user_id, v_current_email
    from auth.users as u
    where lower(regexp_replace(u.email, '^[[:space:]]+|[[:space:]]+$', '', 'g')) = v_email
    limit 2;
  exception
    when no_data_found then
      raise exception using errcode = 'P0002', message = 'portfolio_members_account_not_found';
    when too_many_rows then
      raise exception using errcode = 'PM002', message = 'portfolio_members_account_ambiguous';
  end;

  insert into public.portfolio_members as m (portfolio_id, user_id, role)
  values (p_portfolio_id, v_user_id, p_role)
  returning jsonb_build_object(
    'user_id', m.user_id, 'role', m.role, 'created_at', m.created_at, 'email', v_current_email
  ) into v_member;
  return v_member;
end;
$$;

create or replace function public.change_portfolio_member_role(p_portfolio_id uuid, p_user_id uuid, p_role text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old_role text;
  v_member jsonb;
begin
  perform public.lock_portfolio_for_member_admin(p_portfolio_id);
  if p_user_id is null or p_role is null or p_role not in ('OWNER', 'EDITOR', 'VIEWER') then
    raise exception using errcode = '22023', message = 'portfolio_members_invalid_input';
  end if;

  select m.role into v_old_role from public.portfolio_members as m
  where m.portfolio_id = p_portfolio_id and m.user_id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'portfolio_members_member_not_found';
  end if;

  update public.portfolio_members as m set role = p_role
  where m.portfolio_id = p_portfolio_id and m.user_id = p_user_id
  returning jsonb_build_object('user_id', m.user_id, 'role', m.role, 'created_at', m.created_at) into v_member;
  if v_old_role = 'OWNER' and p_role <> 'OWNER' then
    perform public.assert_portfolio_has_owner(p_portfolio_id);
  end if;
  return v_member;
end;
$$;

create or replace function public.remove_portfolio_member(p_portfolio_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old_role text;
begin
  perform public.lock_portfolio_for_member_admin(p_portfolio_id);
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'portfolio_members_invalid_input';
  end if;

  delete from public.portfolio_members as m
  where m.portfolio_id = p_portfolio_id and m.user_id = p_user_id
  returning m.role into v_old_role;
  if not found then
    raise exception using errcode = 'P0002', message = 'portfolio_members_member_not_found';
  end if;
  if v_old_role = 'OWNER' then
    perform public.assert_portfolio_has_owner(p_portfolio_id);
  end if;
end;
$$;

revoke all on function public.touch_portfolio_membership_parent(uuid),
  public.lock_portfolio_for_member_admin(uuid), public.assert_portfolio_has_owner(uuid)
  from public, anon, authenticated, service_role cascade;

revoke all on function public.invite_portfolio_member(uuid, text, text),
  public.change_portfolio_member_role(uuid, uuid, text), public.remove_portfolio_member(uuid, uuid)
  from public, anon, authenticated, service_role cascade;
grant execute on function public.invite_portfolio_member(uuid, text, text),
  public.change_portfolio_member_role(uuid, uuid, text), public.remove_portfolio_member(uuid, uuid)
  to authenticated;

drop function if exists public.find_user_by_email(text) restrict;
drop function if exists public.count_portfolio_owners(uuid) restrict;

drop policy if exists "owners can insert portfolio members" on public.portfolio_members;
drop policy if exists "owners can update portfolio members" on public.portfolio_members;
drop policy if exists "owners can delete portfolio members" on public.portfolio_members;

revoke insert, update, delete, truncate on table public.portfolio_members
  from public, anon, authenticated cascade;
revoke insert (id, portfolio_id, user_id, role, created_at), update (id, portfolio_id, user_id, role, created_at)
  on table public.portfolio_members from public, anon, authenticated cascade;

create or replace function public.serialize_portfolio_membership_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (
    old.portfolio_id is distinct from new.portfolio_id or old.user_id is distinct from new.user_id
  ) then
    raise exception using errcode = '22023', message = 'portfolio_members_identity_immutable';
  end if;

  if tg_op = 'DELETE' then
    -- Si la cascada ya borró el padre, no queda fila que actualizar. Los conflictos de serialización se propagan.
    perform public.touch_portfolio_membership_parent(old.portfolio_id);
    return old;
  end if;
  perform public.touch_portfolio_membership_parent(new.portfolio_id);
  return new;
end;
$$;

create or replace function public.check_portfolio_owner_after_membership_loss()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform public.assert_portfolio_has_owner(old.portfolio_id);
  return null;
end;
$$;

revoke all on function public.serialize_portfolio_membership_change(),
  public.check_portfolio_owner_after_membership_loss()
  from public, anon, authenticated, service_role cascade;

drop trigger if exists serialize_portfolio_membership_change on public.portfolio_members;
create trigger serialize_portfolio_membership_change
before insert or update or delete on public.portfolio_members
for each row execute function public.serialize_portfolio_membership_change();

drop trigger if exists check_portfolio_owner_after_member_delete on public.portfolio_members;
create constraint trigger check_portfolio_owner_after_member_delete
after delete on public.portfolio_members deferrable initially deferred
for each row when (old.role = 'OWNER')
execute function public.check_portfolio_owner_after_membership_loss();

drop trigger if exists check_portfolio_owner_after_member_demotion on public.portfolio_members;
create constraint trigger check_portfolio_owner_after_member_demotion
after update on public.portfolio_members deferrable initially deferred
for each row when (old.role = 'OWNER' and new.role <> 'OWNER')
execute function public.check_portfolio_owner_after_membership_loss();

-- Detecta privilegios heredados que no se quitan mediante la revocación de grants directos.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_roles as r where r.rolname in ('anon', 'authenticated')
    and (
      pg_catalog.has_any_column_privilege(r.oid, 'auth.users', 'SELECT')
      or pg_catalog.has_any_column_privilege(r.oid, 'public.portfolio_members', 'INSERT,UPDATE')
      or pg_catalog.has_table_privilege(r.oid, 'public.portfolio_members', 'DELETE,TRUNCATE')
    )
  ) or exists (
    select 1
    from (values
      ('public.list_my_portfolio_memberships()'::regprocedure, true),
      ('public.list_portfolio_members(uuid)'::regprocedure, true),
      ('public.invite_portfolio_member(uuid,text,text)'::regprocedure, true),
      ('public.change_portfolio_member_role(uuid,uuid,text)'::regprocedure, true),
      ('public.remove_portfolio_member(uuid,uuid)'::regprocedure, true),
      ('public.touch_portfolio_membership_parent(uuid)'::regprocedure, false),
      ('public.lock_portfolio_for_member_admin(uuid)'::regprocedure, false),
      ('public.assert_portfolio_has_owner(uuid)'::regprocedure, false),
      ('public.serialize_portfolio_membership_change()'::regprocedure, false),
      ('public.check_portfolio_owner_after_membership_loss()'::regprocedure, false)
    ) as f(signature, exposed)
    where pg_catalog.has_function_privilege('anon', f.signature, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', f.signature, 'EXECUTE') <> f.exposed
  ) then
    raise exception 'portfolio_members_browser_acl_conflict';
  end if;
end;
$$;
