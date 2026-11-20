import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { setTimeout } from "node:timers/promises";

const require = createRequire(import.meta.url);
const pgModule = process.env.MEMBERSHIP_PG_MODULE;
const pwfile = process.env.MEMBERSHIP_PG_PWFILE;
if (!pgModule || !pwfile) throw new Error("Define MEMBERSHIP_PG_MODULE y MEMBERSHIP_PG_PWFILE del clúster descartable.");
const { Client } = require(pgModule);
const config = {
  host: "127.0.0.1",
  port: Number(process.env.MEMBERSHIP_PG_PORT ?? 45218),
  user: "fixture_admin",
  database: "postgres",
  password: readFileSync(pwfile, "utf8").trim(),
  connectionTimeoutMillis: 3000,
  statement_timeout: 5500,
  query_timeout: 6500,
  application_name: "portfolio-memberships-synthetic-test",
};
const a = new Client(config);
const b = new Client(config);

before(async () => {
  await Promise.all([a.connect(), b.connect()]);
  assert.notEqual(a.processID, b.processID);
  assert.equal((await a.query("select current_user as actor")).rows[0].actor, "fixture_admin");
  assert.equal((await a.query("select exists(select 1 from pg_roles where rolname = 'fixture_admin' and rolsuper) as fixture")).rows[0].fixture, true);
  await a.query(readFileSync(new URL("../../supabase/migrations/0014_secure_portfolio_memberships.sql", import.meta.url), "utf8"));
});

after(async () => { await Promise.allSettled([a.end(), b.end()]); });

async function seed() {
  const one = randomUUID();
  const two = randomUUID();
  const invite = randomUUID();
  const email = `${invite}@example.test`;
  await a.query("insert into auth.users (id, email) values ($1, $2), ($3, $4), ($5, $6)",
    [one, `${one}@example.test`, two, `${two}@example.test`, invite, email]);
  const portfolio = (await a.query("select id from public.portfolios where user_id = $1", [one])).rows[0].id;
  await a.query("insert into public.portfolio_members (portfolio_id, user_id, role) values ($1, $2, 'OWNER')", [portfolio, two]);
  return { one, two, invite, email, portfolio };
}

async function beginAs(client, user, isolation = "READ COMMITTED") {
  await client.query(`begin isolation level ${isolation}`);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
  await client.query("set local role authenticated");
}

const change = (client, portfolio, user, role = "VIEWER") =>
  client.query("select public.change_portfolio_member_role($1, $2, $3) as member", [portfolio, user, role]);
const remove = (client, portfolio, user) => client.query("select public.remove_portfolio_member($1, $2)", [portfolio, user]);
const inviteAs = (client, portfolio, email) =>
  client.query("select public.invite_portfolio_member($1, $2, 'VIEWER') as member", [portfolio, email]);

async function whileBlocked(pending) {
  const outcome = pending.then((result) => ({ result }), (error) => ({ error }));
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    const { rows } = await a.query("select $1 = any(pg_blocking_pids($2)) as blocked", [a.processID, b.processID]);
    if (rows[0].blocked) return { outcome };
    await setTimeout(20);
  }
  throw new Error("PostgreSQL no confirmó que la sesión B estuviera esperando a la sesión A.");
}

async function owners(portfolio) {
  const { rows } = await a.query("select user_id from public.portfolio_members where portfolio_id = $1 and role = 'OWNER' order by user_id", [portfolio]);
  return rows.map((row) => row.user_id);
}

async function rollbackBoth() {
  await Promise.allSettled([a.query("rollback"), b.query("rollback")]);
}

test("READ COMMITTED: dos cambios válidos por separado no quitan a los dos propietarios", async () => {
  const { one, two, portfolio } = await seed();
  try {
    await beginAs(a, one);
    await beginAs(b, two);
    await change(a, portfolio, one);
    const { outcome } = await whileBlocked(remove(b, portfolio, two));
    await a.query("commit");
    assert.equal((await outcome).error?.code, "PM001");
    await b.query("rollback");
    assert.deepEqual(await owners(portfolio), [two]);
  } finally { await rollbackBoth(); }
});

for (const [isolation, expected] of [["READ COMMITTED", "42501"], ["REPEATABLE READ", "40001"], ["SERIALIZABLE", "40001"]]) {
  test(`${isolation}: una sesión que espera no escribe con el rol anterior`, async () => {
    const { one, two, portfolio, email, invite } = await seed();
    try {
      await beginAs(a, one);
      await beginAs(b, two, isolation);
      const { rows } = await b.query("select public.current_user_has_role($1, 'OWNER') as owner", [portfolio]);
      assert.equal(rows[0].owner, true);
      await change(a, portfolio, two);
      const { outcome } = await whileBlocked(inviteAs(b, portfolio, email));
      await a.query("commit");
      assert.equal((await outcome).error?.code, expected);
      await b.query("rollback");
      assert.deepEqual(await owners(portfolio), [one]);
      assert.equal((await a.query("select 1 from public.portfolio_members where portfolio_id = $1 and user_id = $2", [portfolio, invite])).rowCount, 0);
    } finally { await rollbackBoth(); }
  });
}

test("READ COMMITTED: dos invitaciones coincidentes crean una sola membresía", async () => {
  const { one, two, portfolio, email, invite } = await seed();
  try {
    await beginAs(a, one);
    await beginAs(b, two);
    assert.equal((await inviteAs(a, portfolio, email)).rows[0].member.user_id, invite);
    const { outcome } = await whileBlocked(inviteAs(b, portfolio, email));
    await a.query("commit");
    assert.equal((await outcome).error?.code, "23505");
    await b.query("rollback");
    assert.equal((await a.query("select 1 from public.portfolio_members where portfolio_id = $1 and user_id = $2", [portfolio, invite])).rowCount, 1);
  } finally { await rollbackBoth(); }
});

test("ACL de navegador y retiro de consultas independientes", async () => {
  const { rows } = await a.query(`select rolname,
    has_any_column_privilege(oid,'auth.users','SELECT') as catalogo,
    has_any_column_privilege(oid,'public.portfolio_members','INSERT,UPDATE') as columnas,
    has_table_privilege(oid,'public.portfolio_members','DELETE,TRUNCATE') as borrado,
    to_regprocedure('public.find_user_by_email(text)') as correo,
    to_regprocedure('public.count_portfolio_owners(uuid)') as conteo
    from pg_roles where rolname in ('anon','authenticated') order by rolname`);
  assert.deepEqual(rows, ["anon", "authenticated"].map((rolname) => ({ rolname, catalogo: false, columnas: false, borrado: false, correo: null, conteo: null })));
});

test("las FK permiten eliminar un portafolio mediante su OWNER y conservan los demás", async () => {
  const { one, two, portfolio } = await seed();
  try {
    await beginAs(a, one);
    assert.equal((await a.query("delete from public.portfolios where id = $1", [portfolio])).rowCount, 1);
    await a.query("commit");
    assert.equal((await a.query("select 1 from public.portfolio_members where portfolio_id = $1", [portfolio])).rowCount, 0);
    assert.equal((await a.query("select 1 from public.portfolios where user_id = $1", [two])).rowCount, 1);
  } finally { await rollbackBoth(); }
});

test("cascada mixta: revierte si se pierde el último OWNER sobreviviente y funciona si queda otro", async () => {
  const { one, two, portfolio } = await seed();
  const other = (await a.query("select id from public.portfolios where user_id = $1", [two])).rows[0].id;
  await a.query("insert into public.portfolio_members (portfolio_id, user_id, role) values ($1, $2, 'OWNER')", [other, one]);
  await a.query("update public.portfolio_members set role = 'VIEWER' where portfolio_id = $1 and user_id = $2", [other, two]);
  await assert.rejects(a.query("delete from auth.users where id = $1", [one]), { code: "PM001" });
  assert.deepEqual(await owners(other), [one]);
  assert.equal((await a.query("select 1 from public.portfolios where id = $1", [portfolio])).rowCount, 1);
  await a.query("update public.portfolio_members set role = 'OWNER' where portfolio_id = $1 and user_id = $2", [other, two]);
  assert.equal((await a.query("delete from auth.users where id = $1", [one])).rowCount, 1);
  assert.deepEqual(await owners(other), [two]);
  assert.equal((await a.query("select 1 from public.portfolio_members where portfolio_id = $1", [portfolio])).rowCount, 0);
});

test("el guard de tabla rechaza degradación o baja directa del único OWNER en mantenimiento", async () => {
  const { one, two, portfolio } = await seed();
  await a.query("delete from public.portfolio_members where portfolio_id = $1 and user_id = $2", [portfolio, two]);
  await assert.rejects(a.query("update public.portfolio_members set role = 'VIEWER' where portfolio_id = $1 and user_id = $2", [portfolio, one]), { code: "PM001" });
  await assert.rejects(a.query("delete from public.portfolio_members where portfolio_id = $1 and user_id = $2", [portfolio, one]), { code: "PM001" });
  assert.deepEqual(await owners(portfolio), [one]);
});
