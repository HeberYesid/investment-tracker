// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migration = "0014_secure_portfolio_memberships.sql";
const readMigration = (name: string) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

const owner = "10000000-0000-4000-8000-000000000001";
const editor = "10000000-0000-4000-8000-000000000002";
const viewer = "10000000-0000-4000-8000-000000000003";
const outsider = "10000000-0000-4000-8000-000000000004";
const unassigned = "10000000-0000-4000-8000-000000000005";
const a = "20000000-0000-4000-8000-000000000001";
const b = "20000000-0000-4000-8000-000000000002";
const c = "20000000-0000-4000-8000-000000000003";
const d = "20000000-0000-4000-8000-000000000004";
const timestamp = "2026-01-02T15:30:00+00:00";
type ParentVersion = { xmin: string; updated_at: Date };

async function setSession(tx: Transaction, user: string) {
  await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
  await tx.exec("set local role authenticated");
}

describe("frontera SQL de membresías", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      set time zone 'UTC';
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      alter default privileges in schema public
        grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public
        grant all on functions to anon, authenticated, service_role;
      create schema auth;
      create schema extensions;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to anon, authenticated;
    `);
    await db.exec(readMigration("0001_foundation.sql").replace(
      "create extension if not exists pgcrypto with schema extensions;",
      "",
    ));
    await db.exec(readMigration("0002_fix_fx_rate_cop.sql"));
    await db.query(`
      insert into auth.users (id, email) values
        ($1, 'Owner@example.test'), ($2, 'Old@example.test'), ($3, null),
        ($4, 'Outsider@example.test'), ($5, 'Invitee@example.test');
    `, [owner, editor, viewer, outsider, unassigned]);
    await db.exec(readMigration("0003_auth_and_permissions.sql"));
    await db.exec(readMigration("0009_role_aware_trades_imports_rls.sql"));
    await db.query(`
      insert into public.portfolios (id, user_id, name, created_at) values
        ($3, $5, 'C', '2026-01-05'), ($2, $5, 'B', '2026-01-02'),
        ($1, $6, 'A', '2026-01-02'), ($4, $5, 'D', '2026-01-01');
    `, [a, b, c, d, outsider, owner]);
    await db.query(`
      insert into public.portfolio_members (portfolio_id, user_id, role, created_at) values
        ($1, $5, 'OWNER', $9), ($1, $6, 'EDITOR', $9), ($1, $7, 'VIEWER', $9),
        ($2, $5, 'EDITOR', $9), ($2, $8, 'OWNER', $9),
        ($3, $5, 'VIEWER', $9), ($3, $8, 'OWNER', $9), ($4, $8, 'OWNER', $9);
    `, [a, b, c, d, owner, editor, viewer, outsider, timestamp]);
    await db.query("update auth.users set email = 'Current@example.test' where id = $1", [editor]);
    await db.exec(`
      grant insert (portfolio_id, user_id, role), update (role) on public.portfolio_members to public;
      grant insert (role), update (role) on public.portfolio_members to anon, authenticated;
    `);
    await db.exec(readMigration(migration));
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  function asUser<T>(user: string, query: string, params: unknown[] = []) {
    return db.transaction(async (tx) => {
      await setSession(tx, user);
      return tx.query<T>(query, params);
    });
  }

  const option = (portfolio_id: string, name: string, role: string) =>
    ({ portfolio_id, name, role, base_currency: "USD" });

  it.each([
    [owner, [option(a, "A", "OWNER"), option(b, "B", "EDITOR"), option(c, "C", "VIEWER")]],
    [editor, [option(a, "A", "EDITOR")]],
    [viewer, [option(a, "A", "VIEWER")]],
    [outsider, [option(d, "D", "OWNER"), option(b, "B", "OWNER"), option(c, "C", "OWNER")]],
    [unassigned, []],
  ] as const)("membresías propias: proyecta solo las opciones vigentes de %s en orden estable", async (user, options) => {
    const result = await asUser(user, "select public.list_my_portfolio_memberships() as data");
    expect(result.rows).toEqual([{ data: options }]);
  });

  it("listado de OWNER: proyecta únicamente miembros existentes, con correo actual o null", async () => {
    const result = await asUser(owner, "select public.list_portfolio_members($1) as data", [a]);
    expect(result.rows).toEqual([{ data: [
      { user_id: owner, role: "OWNER", email: "Owner@example.test", created_at: timestamp },
      { user_id: editor, role: "EDITOR", email: "Current@example.test", created_at: timestamp },
      { user_id: viewer, role: "VIEWER", email: null, created_at: timestamp },
    ] }]);
  });

  it.each([editor, viewer, outsider, unassigned])("listado de OWNER: deniega la proyección a %s", async (user) => {
    await expect(asUser(user, "select public.list_portfolio_members($1)", [a]))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("mantiene el SELECT directo de membresías limitado por la política de OWNER", async () => {
    const result = await asUser(owner, "select user_id from public.portfolio_members order by user_id");
    expect(result.rows).toEqual([owner, editor, viewer].map((user_id) => ({ user_id })));
    for (const user of [editor, viewer]) {
      const self = await asUser(user, "select user_id from public.portfolio_members where user_id = $1", [user]);
      expect(self.rows).toEqual([]);
    }
    const policies = await db.query(`
      select polname, polroles = array['authenticated'::regrole::oid] as authenticated
      from pg_catalog.pg_policy
      where polrelid = 'public.portfolio_members'::regclass and polcmd = 'r';
    `);
    expect(policies.rows).toEqual([{ polname: "owners can read portfolio members", authenticated: true }]);
  });

  it("restringe EXECUTE de ambas proyecciones y mantiene cerrado el catálogo de cuentas", async () => {
    const functions = await db.query(`
      select proname, prosecdef as security_definer, proconfig as settings,
        has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated,
        has_function_privilege('anon', oid, 'EXECUTE') as anon,
        exists (
          select 1 from aclexplode(coalesce(proacl, acldefault('f', proowner)))
          where grantee = 0 and privilege_type = 'EXECUTE'
        ) as public
      from pg_catalog.pg_proc where oid in (
        'public.list_my_portfolio_memberships()'::regprocedure,
        'public.list_portfolio_members(uuid)'::regprocedure
      ) order by proname;
    `);
    expect(functions.rows).toEqual(["list_my_portfolio_memberships", "list_portfolio_members"].map((proname) => ({
      proname, security_definer: true, settings: ["search_path=pg_catalog, pg_temp"],
      authenticated: true, anon: false, public: false,
    })));
    const directory = await db.query(`
      select rolname from pg_catalog.pg_roles where rolname in ('anon', 'authenticated')
      and has_any_column_privilege(oid, 'auth.users', 'SELECT');
    `);
    expect(directory.rows).toEqual([]);
  });

  const invite = "select public.invite_portfolio_member($1, $2, $3) as data";
  const change = "select public.change_portfolio_member_role($1, $2, $3) as data";
  const remove = "select public.remove_portfolio_member($1, $2)";

  it("invitación: normaliza el correo, devuelve el miembro con correo actual y detecta duplicados", async () => {
    await db.transaction(async (tx) => {
      await setSession(tx, owner);
      const { rows } = await tx.query(invite, [a, " \tINVITEE@EXAMPLE.TEST \n", "VIEWER"]);
      expect(rows).toEqual([{ data: {
        user_id: unassigned, role: "VIEWER", email: "Invitee@example.test", created_at: expect.any(String),
      } }]);
      const persisted = await tx.query("select role from public.portfolio_members where portfolio_id = $1 and user_id = $2", [a, unassigned]);
      expect(persisted.rows).toEqual([{ role: "VIEWER" }]);
      await tx.exec("savepoint duplicate_invitation");
      await expect(tx.query(invite, [a, "Invitee@example.test", "EDITOR"]))
        .rejects.toMatchObject({ code: "23505" });
      await tx.exec("rollback to savepoint duplicate_invitation");
      await tx.rollback();
    });
  });

  it("invitación: distingue cuenta ausente, correo inválido, rol inválido y coincidencia ambigua", async () => {
    await expect(asUser(owner, invite, [a, "absent@example.test", "VIEWER"]))
      .rejects.toMatchObject({ code: "P0002" });
    for (const [email, role] of [["sin-arroba", "VIEWER"], [null, "VIEWER"], ["Invitee@example.test", "OWNER"]]) {
      await expect(asUser(owner, invite, [a, email, role])).rejects.toMatchObject({ code: "22023" });
    }
    await expect(db.transaction(async (tx) => {
      await tx.exec("insert into auth.users (id, email) values (gen_random_uuid(), 'INVITEE@example.test')");
      await setSession(tx, owner);
      await tx.query(invite, [a, "invitee@example.test", "EDITOR"]);
      await tx.rollback();
    })).rejects.toMatchObject({ code: "PM002" });
  });

  it.each([editor, viewer, outsider, unassigned])("mutaciones: deniega a %s sin depender de la cuenta objetivo", async (user) => {
    for (const email of ["Invitee@example.test", "absent@example.test"]) {
      await expect(asUser(user, invite, [a, email, "VIEWER"])).rejects.toMatchObject({ code: "42501" });
    }
    await expect(asUser(user, change, [a, owner, "VIEWER"])).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(user, remove, [a, owner])).rejects.toMatchObject({ code: "42501" });
  });

  it("cambio y baja: acota el destino al portafolio y rechaza perder el único OWNER", async () => {
    await expect(asUser(owner, change, [a, outsider, "EDITOR"])).rejects.toMatchObject({ code: "P0002" });
    await expect(asUser(owner, remove, [a, outsider])).rejects.toMatchObject({ code: "P0002" });
    await expect(asUser(owner, change, [a, editor, "OTHER"])).rejects.toMatchObject({ code: "22023" });
    await expect(asUser(owner, change, [a, owner, "EDITOR"])).rejects.toMatchObject({ code: "PM001" });
    await expect(asUser(owner, remove, [a, owner])).rejects.toMatchObject({ code: "PM001" });
    const current = await asUser(owner, "select public.current_user_role($1) as role", [a]);
    expect(current.rows).toEqual([{ role: "OWNER" }]);
  });

  it("cambio y baja: permite promoción, degradación con otro OWNER y baja de VIEWER", async () => {
    await db.transaction(async (tx) => {
      await setSession(tx, owner);
      const before = await tx.query<ParentVersion>("select xmin::text, updated_at from public.portfolios where id = $1", [a]);
      const promoted = await tx.query(change, [a, editor, "OWNER"]);
      expect(promoted.rows).toEqual([{ data: { user_id: editor, role: "OWNER", created_at: timestamp } }]);
      const after = await tx.query<ParentVersion>("select xmin::text, updated_at from public.portfolios where id = $1", [a]);
      expect(after.rows[0].xmin).not.toEqual(before.rows[0].xmin);
      expect(after.rows[0].updated_at).toEqual(before.rows[0].updated_at);
      const demoted = await tx.query(change, [a, owner, "EDITOR"]);
      expect(demoted.rows).toEqual([{ data: { user_id: owner, role: "EDITOR", created_at: timestamp } }]);

      await setSession(tx, editor);
      await tx.query(remove, [a, viewer]);
      const persisted = await tx.query("select user_id, role from public.portfolio_members where portfolio_id = $1 order by user_id", [a]);
      expect(persisted.rows).toEqual([{ user_id: owner, role: "EDITOR" }, { user_id: editor, role: "OWNER" }]);
      await tx.rollback();
    });
  });

  it("retira las RPC legadas y el DML directo de los roles de navegador, incluida la ACL de columna", async () => {
    const legacy = await db.query(`
      select to_regprocedure('public.find_user_by_email(text)') as lookup,
        to_regprocedure('public.count_portfolio_owners(uuid)') as count;
    `);
    expect(legacy.rows).toEqual([{ lookup: null, count: null }]);
    const permissions = await db.query(`
      select rolname from pg_catalog.pg_roles where rolname in ('anon', 'authenticated')
        and (has_any_column_privilege(oid, 'public.portfolio_members', 'INSERT,UPDATE')
          or has_table_privilege(oid, 'public.portfolio_members', 'DELETE,TRUNCATE'));
    `);
    expect(permissions.rows).toEqual([]);
    const policies = await db.query("select polcmd from pg_catalog.pg_policy where polrelid = 'public.portfolio_members'::regclass");
    expect(policies.rows).toEqual([{ polcmd: "r" }]);
    const functions = await db.query(`
      select proname, provolatile,
        has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated,
        has_function_privilege('anon', oid, 'EXECUTE') as anon
      from pg_catalog.pg_proc where oid in (
        'public.invite_portfolio_member(uuid,text,text)'::regprocedure,
        'public.change_portfolio_member_role(uuid,uuid,text)'::regprocedure,
        'public.remove_portfolio_member(uuid,uuid)'::regprocedure
      ) order by proname;
    `);
    expect(functions.rows).toEqual([
      "change_portfolio_member_role", "invite_portfolio_member", "remove_portfolio_member",
    ].map((proname) => ({ proname, provolatile: "v", authenticated: true, anon: false })));
  });

  it.each(["baja", "degradación"])("integridad diferida: una %s directa del último OWNER revierte al cerrar", async (operation) => {
    let statementCompleted = false;
    await expect(db.transaction(async (tx) => {
      if (operation === "baja") {
        await tx.query("delete from public.portfolio_members where portfolio_id = $1 and user_id = $2", [a, owner]);
      } else {
        await tx.query("update public.portfolio_members set role = 'VIEWER' where portfolio_id = $1 and user_id = $2", [a, owner]);
      }
      statementCompleted = true;
      await tx.exec("set constraints all immediate");
      await tx.rollback();
    })).rejects.toMatchObject({ code: "PM001" });
    expect(statementCompleted).toBe(true);
    const persisted = await asUser(owner, "select public.current_user_role($1) as role", [a]);
    expect(persisted.rows).toEqual([{ role: "OWNER" }]);
  });

  it("integridad diferida: permite reemplazar al propietario antes del cierre", async () => {
    await db.transaction(async (tx) => {
      await tx.query("update public.portfolio_members set role = 'EDITOR' where portfolio_id = $1 and user_id = $2", [a, owner]);
      await tx.query("update public.portfolio_members set role = 'OWNER' where portfolio_id = $1 and user_id = $2", [a, editor]);
      await tx.exec("set constraints all immediate");
      const remaining = await tx.query("select user_id from public.portfolio_members where portfolio_id = $1 and role = 'OWNER'", [a]);
      expect(remaining.rows).toEqual([{ user_id: editor }]);
      await tx.rollback();
    });
  });

  it("integridad de membresía: conserva los identificadores del portafolio y del usuario", async () => {
    await expect(db.query("update public.portfolio_members set portfolio_id = $1 where portfolio_id = $2 and user_id = $3", [d, a, owner]))
      .rejects.toMatchObject({ code: "22023" });
    await expect(db.query("update public.portfolio_members set user_id = $1 where portfolio_id = $2 and user_id = $3", [unassigned, a, owner]))
      .rejects.toMatchObject({ code: "22023" });
  });

  it("cascada: un OWNER puede eliminar su portafolio con todas sus membresías", async () => {
    await db.transaction(async (tx) => {
      await setSession(tx, owner);
      const deleted = await tx.query("delete from public.portfolios where id = $1 returning id", [a]);
      expect(deleted.rows).toEqual([{ id: a }]);
      await tx.exec("reset role; set constraints all immediate");
      const remaining = await tx.query("select user_id from public.portfolio_members where portfolio_id = $1", [a]);
      expect(remaining.rows).toEqual([]);
      await tx.rollback();
    });
  });

  it("cascada por FK de cuenta sintética: controla por separado el padre eliminado y los sobrevivientes", async () => {
    // La cuenta sintética outsider es titular de B, C y D (se borran) y será OWNER de A (sobrevive).
    await db.transaction(async (tx) => {
      await tx.query("insert into public.portfolio_members (portfolio_id, user_id, role) values ($1, $2, 'OWNER')", [a, outsider]);
      await tx.query("delete from auth.users where id = $1", [outsider]);
      await tx.exec("set constraints all immediate");
      const surviving = await tx.query("select id from public.portfolios order by id");
      expect(surviving.rows).toEqual([{ id: a }]);
      const members = await tx.query("select user_id from public.portfolio_members order by user_id");
      expect(members.rows).toEqual([owner, editor, viewer].map((user_id) => ({ user_id })));
      await tx.rollback();
    });
    await expect(db.transaction(async (tx) => {
      await tx.query("insert into public.portfolio_members (portfolio_id, user_id, role) values ($1, $2, 'OWNER')", [a, outsider]);
      await tx.query("delete from public.portfolio_members where portfolio_id = $1 and user_id = $2", [a, owner]);
      await tx.query("delete from auth.users where id = $1", [outsider]);
    })).rejects.toMatchObject({ code: "PM001" });
    const restored = await db.query("select id from public.portfolios order by id");
    expect(restored.rows).toEqual([a, b, c, d].map((id) => ({ id })));
    const current = await asUser(owner, "select public.current_user_role($1) as role", [a]);
    expect(current.rows).toEqual([{ role: "OWNER" }]);
  });

  it("conserva las tres FK en cascada y el alta de usuario con OWNER inicial", async () => {
    const fk = await db.query(`
      select conname, confdeltype from pg_catalog.pg_constraint where conname in (
        'portfolio_members_portfolio_id_fkey', 'portfolio_members_user_id_fkey', 'portfolios_user_id_fkey'
      ) order by conname;
    `);
    expect(fk.rows).toEqual([
      "portfolio_members_portfolio_id_fkey", "portfolio_members_user_id_fkey", "portfolios_user_id_fkey",
    ].map((conname) => ({ conname, confdeltype: "c" })));
    await db.transaction(async (tx) => {
      const created = await tx.query<{ id: string }>("insert into auth.users values (gen_random_uuid(), 'new@example.test') returning id");
      const user = created.rows[0].id;
      const result = await tx.query(`
        select p.name, p.base_currency, m.role
        from public.profiles as u
        join public.portfolios as p on p.user_id = u.id
        join public.portfolio_members as m on m.portfolio_id = p.id and m.user_id = u.id
        where u.id = $1;
      `, [user]);
      expect(result.rows).toEqual([{ name: "Mi portafolio", base_currency: "USD", role: "OWNER" }]);
      await tx.rollback();
    });
  });

  it("mantiene privados los helpers y triggers de integridad y sus comprobaciones diferidas", async () => {
    const functions = await db.query(`
      select p.proname
      from pg_catalog.pg_proc as p
      where p.oid in (
        'public.touch_portfolio_membership_parent(uuid)'::regprocedure,
        'public.lock_portfolio_for_member_admin(uuid)'::regprocedure,
        'public.assert_portfolio_has_owner(uuid)'::regprocedure,
        'public.serialize_portfolio_membership_change()'::regprocedure,
        'public.check_portfolio_owner_after_membership_loss()'::regprocedure
      ) and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or exists (
          select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))
          where grantee = 0 and privilege_type = 'EXECUTE'
        )
      );
    `);
    expect(functions.rows).toEqual([]);
    const triggers = await db.query(`
      select tgname, tgdeferrable as deferrable, tginitdeferred as initially_deferred
      from pg_catalog.pg_trigger
      where tgrelid = 'public.portfolio_members'::regclass and not tgisinternal
      order by tgname;
    `);
    expect(triggers.rows).toEqual([
      { tgname: "check_portfolio_owner_after_member_delete", deferrable: true, initially_deferred: true },
      { tgname: "check_portfolio_owner_after_member_demotion", deferrable: true, initially_deferred: true },
      { tgname: "serialize_portfolio_membership_change", deferrable: false, initially_deferred: false },
    ]);
  });
});
