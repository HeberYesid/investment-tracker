begin;

-- No se promueve 0012: se retiran sus políticas por nombre incluso si nunca existieron.
drop policy if exists "authenticated can insert assets" on public.assets;
drop policy if exists "authenticated can update assets" on public.assets;
alter table public.assets enable row level security;
alter table public.assets add column if not exists requires_verified_quote_symbol boolean not null default false;

revoke insert, update, delete, truncate, references, trigger on public.assets
  from public, anon, authenticated, service_role cascade;
grant select on public.assets to anon, authenticated, service_role;

do $$
declare
  v_columns text;
  v_name text;
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on public.assets from public, anon, authenticated, service_role cascade';
  end if;
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_columns
  from pg_catalog.pg_attribute where attrelid = 'public.assets'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke insert (%1$s), update (%1$s), references (%1$s) on public.assets
    from public, anon, authenticated, service_role cascade', v_columns);

  foreach v_name in array array['asset_catalog_writer', 'asset_metadata_writer', 'asset_metadata_operator'] loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname = v_name) then
      execute format('create role %I nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls', v_name);
    end if;
    if exists (
      select 1 from pg_catalog.pg_roles as r where r.rolname = v_name
      and (r.rolcanlogin or r.rolinherit or r.rolsuper or r.rolcreatedb or r.rolcreaterole
        or r.rolreplication or r.rolbypassrls or r.rolconfig is not null
        or exists (select 1 from pg_catalog.pg_auth_members as m where m.member = r.oid))
    ) then
      raise exception using errcode = '42501', message = 'asset_catalog_unexpected_internal_role';
    end if;
  end loop;
end;
$$;

grant usage on schema public to asset_catalog_writer, asset_metadata_writer, asset_metadata_operator;
grant select (id, ticker, exchange, currency, asset_type) on public.assets to asset_catalog_writer;
grant insert (ticker, exchange, currency, asset_type, name, requires_verified_quote_symbol)
  on public.assets to asset_catalog_writer;
grant select (id, ticker, exchange, currency, asset_type, yahoo_symbol, sector, country)
  on public.assets to asset_metadata_writer;
grant update (sector, country) on public.assets to asset_metadata_writer;
grant select on public.assets to asset_metadata_operator;

drop policy if exists "catalog writer reads identities" on public.assets;
create policy "catalog writer reads identities" on public.assets for select to asset_catalog_writer using (true);
drop policy if exists "catalog writer inserts references" on public.assets;
create policy "catalog writer inserts references" on public.assets for insert to asset_catalog_writer
  with check (requires_verified_quote_symbol and yahoo_symbol is null and sector is null and country is null);
drop policy if exists "metadata writer reads identities" on public.assets;
create policy "metadata writer reads identities" on public.assets for select to asset_metadata_writer using (true);
drop policy if exists "metadata writer fills references" on public.assets;
create policy "metadata writer fills references" on public.assets for update to asset_metadata_writer
  using (true) with check (true);
drop policy if exists "metadata operator reads references" on public.assets;
create policy "metadata operator reads references" on public.assets for select to asset_metadata_operator using (true);

-- Verificar permisos efectivos, no solo los ACL que modificó esta migración.
do $$
declare
  v_forbidden text := 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER';
  v_actor record;
  v_column record;
begin
  if current_setting('server_version_num')::int >= 170000 then
    v_forbidden := v_forbidden || ', MAINTAIN';
  end if;

  if exists (
    select 1 from pg_catalog.pg_roles as root
    join pg_catalog.pg_roles as reached on reached.oid = root.oid
      or pg_catalog.pg_has_role(root.oid, reached.oid, 'SET')
    where root.rolname in ('anon', 'authenticated', 'service_role', 'authenticator', 'asset_metadata_operator')
    and (reached.rolsuper or reached.rolcreaterole
      or reached.rolname in ('asset_catalog_writer', 'asset_metadata_writer')
      or (root.rolname <> 'asset_metadata_operator' and pg_catalog.pg_has_role(root.oid, 'asset_metadata_operator', 'MEMBER'))
      or pg_catalog.has_table_privilege(reached.oid, 'public.assets', v_forbidden)
      or pg_catalog.has_any_column_privilege(reached.oid, 'public.assets', 'INSERT, UPDATE, REFERENCES'))
  ) or exists (
    select 1 from pg_catalog.pg_roles as root
    where root.rolname in ('anon', 'authenticated', 'service_role', 'authenticator')
      and (pg_catalog.pg_has_role(root.oid, 'asset_catalog_writer', 'MEMBER')
        or pg_catalog.pg_has_role(root.oid, 'asset_metadata_writer', 'MEMBER'))
  ) then
    raise exception using errcode = '42501', message = 'asset_catalog_unexpected_privileges';
  end if;

  for v_actor in select oid, rolname from pg_catalog.pg_roles
    where rolname in ('asset_catalog_writer', 'asset_metadata_writer') loop
    if pg_catalog.has_table_privilege(v_actor.oid, 'public.assets', v_forbidden || ', SELECT') then
      raise exception using errcode = '42501', message = 'asset_catalog_unexpected_privileges';
    end if;
    for v_column in select attnum, attname from pg_catalog.pg_attribute
      where attrelid = 'public.assets'::regclass and attnum > 0 and not attisdropped loop
      if pg_catalog.has_column_privilege(v_actor.oid, 'public.assets', v_column.attnum,
        'REFERENCES, SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION')
        or pg_catalog.has_column_privilege(v_actor.oid, 'public.assets', v_column.attnum, 'SELECT')
          <> (v_column.attname = any (case when v_actor.rolname = 'asset_catalog_writer'
            then array['id', 'ticker', 'exchange', 'currency', 'asset_type']::name[]
            else array['id', 'ticker', 'exchange', 'currency', 'asset_type', 'yahoo_symbol', 'sector', 'country']::name[] end))
        or pg_catalog.has_column_privilege(v_actor.oid, 'public.assets', v_column.attnum, 'INSERT')
          <> (v_actor.rolname = 'asset_catalog_writer' and v_column.attname in
            ('ticker', 'exchange', 'currency', 'asset_type', 'name', 'requires_verified_quote_symbol'))
        or pg_catalog.has_column_privilege(v_actor.oid, 'public.assets', v_column.attnum, 'UPDATE')
          <> (v_actor.rolname = 'asset_metadata_writer' and v_column.attname in ('sector', 'country')) then
        raise exception using errcode = '42501', message = 'asset_catalog_unexpected_privileges';
      end if;
    end loop;
  end loop;
end;
$$;

create schema if not exists asset_catalog_private;
revoke all on schema asset_catalog_private from public, anon, authenticated, service_role;
grant usage on schema asset_catalog_private to asset_catalog_writer;

create or replace function asset_catalog_private.normalize_identity(p_value text)
returns text language sql immutable strict set search_path = pg_catalog, pg_temp
as $$ select upper(btrim(p_value, E' \t\n\r\f\013') collate "C") $$;

create or replace function asset_catalog_private.assert_catalog_member(p_portfolio_id uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_portfolio_id is null then
    raise exception using errcode = '42501', message = 'asset_catalog_forbidden';
  end if;
  -- FOR KEY SHARE no bloquearía una degradación del rol (UPDATE no cambia la clave).
  perform 1 from public.portfolio_members as m
  where m.user_id = v_uid and m.portfolio_id = p_portfolio_id and m.role in ('OWNER', 'EDITOR')
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'asset_catalog_forbidden';
  end if;
end;
$$;

create or replace function asset_catalog_private.assert_catalog_csv(p_portfolio_id uuid, p_import_id uuid, p_items jsonb)
returns void language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (select 1 from public.csv_imports as i
    where i.id = p_import_id and i.portfolio_id = p_portfolio_id and i.status = 'PREVIEWED')
    or exists (
      select 1 from jsonb_array_elements(p_items) as item(entry)
      cross join lateral jsonb_array_elements_text(item.entry->'row_ids') as claimed(id)
      left join public.csv_import_rows as r on r.id = claimed.id::uuid and r.import_id = p_import_id
        and r.validation_status = 'VALID' and jsonb_typeof(r.parsed_data_json->'ticker') = 'string'
        and asset_catalog_private.normalize_identity(r.parsed_data_json->>'ticker') = item.entry->>'ticker'
      where r.id is null
    ) then
    raise exception using errcode = '42501', message = 'asset_catalog_forbidden';
  end if;
end;
$$;

revoke all on function asset_catalog_private.normalize_identity(text),
  asset_catalog_private.assert_catalog_member(uuid), asset_catalog_private.assert_catalog_csv(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role, asset_metadata_writer, asset_metadata_operator cascade;
grant execute on function asset_catalog_private.normalize_identity(text),
  asset_catalog_private.assert_catalog_member(uuid), asset_catalog_private.assert_catalog_csv(uuid, uuid, jsonb)
  to asset_catalog_writer;

create or replace function public.resolve_asset_references(p_portfolio_id uuid, p_source text, p_import_id uuid, p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_item jsonb;
  v_decision jsonb;
  v_value jsonb;
  v_field text;
  v_items jsonb := '[]';
  v_resolutions jsonb;
  v_pending record;
  v_row_ids uuid[] := array[]::uuid[];
  v_keys text[] := array[]::text[];
  v_row_id uuid;
  v_key text;
  v_ticker text;
  v_asset_id uuid;
  v_uuid_re constant text := '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$';
begin
  perform asset_catalog_private.assert_catalog_member(p_portfolio_id);

  if p_source is null or p_source not in ('MANUAL', 'CSV')
    or (p_source = 'CSV') <> (p_import_id is not null)
    or jsonb_typeof(p_items) is distinct from 'array' or octet_length(p_items::text) > 262144 then
    raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
  end if;
  if jsonb_array_length(p_items) not between 1 and (case when p_source = 'MANUAL' then 1 else 500 end) then
    raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
  end if;

  -- Prevalidar todo el lote antes de consultar candidatos o escribir una referencia.
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or v_item - array['key', 'ticker', 'decision', 'row_ids'] <> '{}'::jsonb
      or jsonb_typeof(v_item->'key') is distinct from 'string'
      or jsonb_typeof(v_item->'ticker') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
    end if;
    v_key := v_item->>'key';
    v_ticker := asset_catalog_private.normalize_identity(v_item->>'ticker');
    if char_length(v_key) not between 1 and 64 or v_key collate "C" ~ '[[:cntrl:]]'
      or v_key = any(v_keys) or char_length(v_item->>'ticker') > 128
      or v_ticker = '' or v_ticker collate "C" ~ '[[:cntrl:]]' then
      raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
    end if;
    v_keys := array_append(v_keys, v_key);
    v_item := jsonb_set(v_item, '{ticker}', to_jsonb(v_ticker));

    if v_item ? 'decision' then
      v_decision := v_item->'decision';
      if jsonb_typeof(v_decision) is distinct from 'object'
        or coalesce(v_decision->>'kind', '') not in ('existing', 'new')
        or v_decision - array['kind', 'asset_id', 'exchange', 'currency', 'asset_type'] <> '{}'::jsonb then
        raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
      end if;
      if v_decision->>'kind' = 'existing' then
        if jsonb_typeof(v_decision->'asset_id') is distinct from 'string'
          or v_decision->>'asset_id' collate "C" !~ v_uuid_re then
          raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
        end if;
      elsif v_decision ? 'asset_id' or not (v_decision ?& array['exchange', 'currency', 'asset_type']) then
        raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
      end if;
      foreach v_field in array array['exchange', 'currency', 'asset_type'] loop
        if v_decision ? v_field then
          if jsonb_typeof(v_decision->v_field) is distinct from 'string'
            or char_length(v_decision->>v_field) > (case v_field when 'exchange' then 64 when 'currency' then 8 else 32 end) then
            raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
          end if;
          v_value := to_jsonb(asset_catalog_private.normalize_identity(v_decision->>v_field));
          if v_value #>> '{}' = '' or (v_value #>> '{}') collate "C" ~ '[[:cntrl:]]' then
            raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
          end if;
          v_decision := jsonb_set(v_decision, array[v_field], v_value);
        end if;
      end loop;
      v_item := jsonb_set(v_item, '{decision}', v_decision);
    end if;

    if p_source = 'CSV' then
      if jsonb_typeof(v_item->'row_ids') is distinct from 'array' then
        raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
      end if;
      if jsonb_array_length(v_item->'row_ids') < 1
        or cardinality(v_row_ids) + jsonb_array_length(v_item->'row_ids') > 500 then
        raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
      end if;
      for v_value in select value from jsonb_array_elements(v_item->'row_ids') loop
        if jsonb_typeof(v_value) is distinct from 'string' or (v_value #>> '{}') collate "C" !~ v_uuid_re then
          raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
        end if;
        v_row_id := (v_value #>> '{}')::uuid;
        if v_row_id = any(v_row_ids) then
          raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
        end if;
        v_row_ids := array_append(v_row_ids, v_row_id);
      end loop;
    elsif v_item ? 'row_ids' then
      raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
    end if;
    v_items := v_items || jsonb_build_array(v_item);
  end loop;

  if p_source = 'CSV' then
    perform asset_catalog_private.assert_catalog_csv(p_portfolio_id, p_import_id, v_items);
  end if;

  with requests as materialized (
    select j.entry->>'key' as key, j.entry->>'ticker' as ticker, j.entry->'decision' as decision,
      j.entry#>>'{decision,kind}' as kind, (j.entry#>>'{decision,asset_id}')::uuid as selected_id,
      j.entry#>>'{decision,exchange}' as exchange, j.entry#>>'{decision,currency}' as currency,
      j.entry#>>'{decision,asset_type}' as asset_type
    from jsonb_array_elements(v_items) as j(entry)
  ), proposed as materialized (
    select r.* from requests as r where r.kind = 'new' and r.ticker collate "C" ~ '^[A-Z0-9._^=-]{1,32}$'
      and r.ticker <> '^GSPC' and r.exchange in ('NASDAQ', 'NYSE', 'BVC')
      and r.currency in ('USD', 'COP') and r.asset_type in ('STOCK', 'ETF')
  ), proposal_groups as (
    select p.ticker, p.exchange, count(distinct (p.currency, p.asset_type)) > 1 as conflict
    from proposed as p group by p.ticker, p.exchange
  ), candidates as materialized (
    select a.id, a.currency, a.asset_type, asset_catalog_private.normalize_identity(a.ticker) as ticker,
      asset_catalog_private.normalize_identity(a.exchange) as exchange
    from public.assets as a join (select distinct p.ticker from proposed as p) as t
      on t.ticker = asset_catalog_private.normalize_identity(a.ticker)
  ), candidate_groups as (
    select c.ticker, c.exchange, count(*) as total, min(c.id::text)::uuid as id,
      min(c.currency) as currency, min(c.asset_type) as asset_type
    from candidates as c group by c.ticker, c.exchange
  ), decisions as (
    select r.key, case
      when r.kind is null then 'needs_disambiguation'
      when r.kind = 'existing' then case
        when a.id is null then 'invalid_reference'
        when asset_catalog_private.normalize_identity(a.ticker) <> r.ticker
          or (r.exchange is not null and asset_catalog_private.normalize_identity(a.exchange) is distinct from r.exchange)
          or (r.currency is not null and r.currency <> a.currency)
          or (r.asset_type is not null and r.asset_type <> a.asset_type) then 'needs_disambiguation'
        else 'resolved' end
      when g.ticker is null then 'invalid_reference'
      when g.conflict then 'needs_disambiguation'
      when c.total = 1 and c.currency = r.currency and c.asset_type = r.asset_type then 'resolved'
      when c.total is not null or l.total is not null then 'needs_disambiguation'
      else 'pending' end as status,
      coalesce(a.id, c.id) as id
    from requests as r
    left join public.assets as a on a.id = r.selected_id
    left join proposal_groups as g on g.ticker = r.ticker and g.exchange = r.exchange
    left join candidate_groups as c on c.ticker = g.ticker and c.exchange = g.exchange
    left join candidate_groups as l on l.ticker = g.ticker and l.exchange is null
  )
  select jsonb_object_agg(d.key, jsonb_build_object('status', d.status) ||
    case when d.status = 'resolved' then jsonb_build_object('asset_id', d.id) else '{}'::jsonb end)
    into v_resolutions from decisions as d;

  -- Una inserción por clave canónica, en el mismo orden para todos los productores.
  for v_pending in
    select j.entry->>'ticker' as ticker, j.entry#>>'{decision,exchange}' as exchange,
      j.entry#>>'{decision,currency}' as currency, j.entry#>>'{decision,asset_type}' as asset_type,
      array_agg(j.entry->>'key') as keys
    from jsonb_array_elements(v_items) as j(entry)
    where v_resolutions->(j.entry->>'key')->>'status' = 'pending'
    group by 1,2,3,4 order by 1,2
  loop
    insert into public.assets (ticker, exchange, currency, asset_type, name, requires_verified_quote_symbol)
    values (v_pending.ticker, v_pending.exchange, v_pending.currency, v_pending.asset_type, v_pending.ticker, true)
    on conflict (ticker, exchange) do nothing returning id into v_asset_id;

    if v_asset_id is null then
      -- En READ COMMITTED esta nueva sentencia ve al ganador canónico; en un snapshot fijo
      -- el conflicto aborta con 40001 y solo puede reintentarse con una transacción nueva.
      select a.id into v_asset_id from public.assets as a
      where a.ticker = v_pending.ticker and a.exchange = v_pending.exchange
        and a.currency = v_pending.currency and a.asset_type = v_pending.asset_type;
    end if;

    foreach v_key in array v_pending.keys loop
      v_resolutions := jsonb_set(v_resolutions, array[v_key], case when v_asset_id is not null
        then jsonb_build_object('status', 'resolved', 'asset_id', v_asset_id)
        else jsonb_build_object('status', 'needs_disambiguation') end);
    end loop;
  end loop;

  return (select jsonb_agg(jsonb_build_object('key', j.entry->>'key') || (v_resolutions->(j.entry->>'key')) order by j.ordinality)
    from jsonb_array_elements(v_items) with ordinality as j(entry, ordinality));
end;
$$;

revoke all on function public.resolve_asset_references(uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role, asset_metadata_writer, asset_metadata_operator cascade;
grant execute on function public.resolve_asset_references(uuid, text, uuid, jsonb) to authenticated;
alter function public.resolve_asset_references(uuid, text, uuid, jsonb) owner to asset_catalog_writer;

create or replace function public.fill_missing_asset_metadata(p_asset_id uuid, p_expected_identity jsonb, p_sector text, p_country text)
returns text language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_field text;
begin
  if p_asset_id is null or jsonb_typeof(p_expected_identity) is distinct from 'object'
    or not (p_expected_identity ?& array['ticker', 'exchange', 'currency', 'asset_type', 'yahoo_symbol'])
    or p_expected_identity - array['ticker', 'exchange', 'currency', 'asset_type', 'yahoo_symbol'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'asset_metadata_invalid_input';
  end if;
  foreach v_field in array array['ticker', 'exchange', 'currency', 'asset_type', 'yahoo_symbol'] loop
    if v_field = 'yahoo_symbol' and jsonb_typeof(p_expected_identity->v_field) = 'null' then
      continue;
    end if;
    if jsonb_typeof(p_expected_identity->v_field) is distinct from 'string'
      or btrim(p_expected_identity->>v_field) = ''
      or char_length(p_expected_identity->>v_field) > 128
      or (p_expected_identity->>v_field) collate "C" ~ U&'[[:cntrl:]\0080-\009F]' then
      raise exception using errcode = '22023', message = 'asset_metadata_invalid_input';
    end if;
  end loop;
  if (p_sector is not null and (btrim(p_sector) = '' or char_length(p_sector) > 128
       or p_sector collate "C" ~ U&'[[:cntrl:]\0080-\009F]'))
    or (p_country is not null and (btrim(p_country) = '' or char_length(p_country) > 64
       or p_country collate "C" ~ U&'[[:cntrl:]\0080-\009F]')) then
    raise exception using errcode = '22023', message = 'asset_metadata_invalid_input';
  end if;

  update public.assets as a
  set sector = coalesce(a.sector, btrim(p_sector)), country = coalesce(a.country, btrim(p_country))
  where a.id = p_asset_id
    and jsonb_build_object('ticker', a.ticker, 'exchange', a.exchange, 'currency', a.currency,
      'asset_type', a.asset_type, 'yahoo_symbol', a.yahoo_symbol) = p_expected_identity
    and ((p_sector is not null and a.sector is null) or (p_country is not null and a.country is null));
  if found then
    return 'updated';
  end if;
  if exists (select 1 from public.assets as a where a.id = p_asset_id
    and jsonb_build_object('ticker', a.ticker, 'exchange', a.exchange, 'currency', a.currency,
      'asset_type', a.asset_type, 'yahoo_symbol', a.yahoo_symbol) = p_expected_identity) then
    return 'no_change';
  end if;
  return 'identity_changed';
end;
$$;

revoke all on function public.fill_missing_asset_metadata(uuid,jsonb,text,text)
  from public, anon, authenticated, service_role, asset_catalog_writer, asset_metadata_operator cascade;
grant execute on function public.fill_missing_asset_metadata(uuid,jsonb,text,text) to asset_metadata_operator;
alter function public.fill_missing_asset_metadata(uuid,jsonb,text,text) owner to asset_metadata_writer;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_roles as root
    join pg_catalog.pg_roles as reached on reached.oid = root.oid or pg_catalog.pg_has_role(root.oid, reached.oid, 'SET')
    where root.rolname in ('anon', 'authenticated', 'service_role', 'authenticator', 'asset_metadata_operator', 'asset_metadata_writer')
    and (
      pg_catalog.has_schema_privilege(reached.oid, 'asset_catalog_private', 'USAGE, CREATE')
      or pg_catalog.has_function_privilege(reached.oid, 'asset_catalog_private.assert_catalog_member(uuid)', 'EXECUTE')
      or pg_catalog.has_function_privilege(reached.oid, 'asset_catalog_private.assert_catalog_csv(uuid,uuid,jsonb)', 'EXECUTE')
      or (pg_catalog.has_function_privilege(reached.oid, 'public.resolve_asset_references(uuid,text,uuid,jsonb)', 'EXECUTE')
        and not (reached.rolname = 'authenticated' and root.rolname in ('authenticated', 'authenticator')))
      or (pg_catalog.has_function_privilege(reached.oid, 'public.fill_missing_asset_metadata(uuid,jsonb,text,text)', 'EXECUTE')
        and reached.rolname not in ('asset_metadata_operator', 'asset_metadata_writer'))
    )
  ) then
    raise exception using errcode = '42501', message = 'asset_catalog_unexpected_privileges';
  end if;
end;
$$;

-- Proyección de lectura: usa los privilegios/RLS del llamante, no los del escritor.
create or replace function public.list_asset_reference_candidates(p_tickers text[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_tickers is null or cardinality(p_tickers) not between 1 and 50 or
    exists (select 1 from unnest(p_tickers) as t(value)
      where value is null or char_length(value) > 128 or btrim(value, E' \t\n\r\f\013') = ''
        or btrim(value, E' \t\n\r\f\013') collate "C" ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'asset_catalog_invalid_input';
  end if;
  return (
    with input as (
      select distinct upper(btrim(value, E' \t\n\r\f\013') collate "C") as ticker
      from unnest(p_tickers) as t(value)
    ), candidates as (
      select t.ticker as lookup, a.id, a.ticker, a.exchange, a.currency, a.asset_type, a.name,
        row_number() over (partition by t.ticker order by a.id) as ordinal
      from input as t join public.assets as a
      on upper(btrim(a.ticker, E' \t\n\r\f\013') collate "C") = t.ticker
    ) select jsonb_agg(jsonb_build_object('ticker', t.ticker, 'truncated', coalesce(c.total > 10, false),
        'candidates', coalesce(c.rows, '[]'::jsonb)) order by t.ticker)
      from input as t left join lateral (
        select count(*) as total, jsonb_agg(jsonb_build_object('id', a.id, 'ticker', a.ticker,
          'exchange', a.exchange, 'currency', a.currency, 'asset_type', a.asset_type, 'name', a.name)
          order by a.ordinal) filter (where a.ordinal <= 10) as rows
        from candidates as a where a.lookup = t.ticker
      ) as c on true
  );
end;
$$;
revoke all on function public.list_asset_reference_candidates(text[]) from public, anon, authenticated, service_role cascade;
grant execute on function public.list_asset_reference_candidates(text[]) to authenticated;

commit;
