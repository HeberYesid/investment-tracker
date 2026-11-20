import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { after, afterEach, before, test } from "node:test";
import { setTimeout } from "node:timers/promises";

const { ASSET_CATALOG_PG_MODULE: modulePath, ASSET_CATALOG_PG_PWFILE: pwfile, ASSET_CATALOG_PG_PORT: port } = process.env;
if (!modulePath || !pwfile || !/^\d{5}$/.test(port ?? "") || +port === 45218 || +port > 65535) {
  throw new Error("Indique ASSET_CATALOG_PG_MODULE, ASSET_CATALOG_PG_PWFILE y ASSET_CATALOG_PG_PORT de un clúster nuevo de catálogo (no el de membresías).");
}
const { Client } = createRequire(import.meta.url)(modulePath);
const config = {
  host: "127.0.0.1", port: +port, user: "fixture_admin", database: "asset_catalog_fixture",
  password: readFileSync(pwfile, "utf8").trim(), connectionTimeoutMillis: 3000,
  statement_timeout: 5500, query_timeout: 6500, application_name: "asset-catalog-synthetic-test",
};
const a = new Client(config);
const b = new Client(config);
const owner = "10000000-0000-4000-8000-000000000001";
const editor = "10000000-0000-4000-8000-000000000002";
const outsider = "10000000-0000-4000-8000-000000000003";
const portfolio = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const sql = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

before(async () => {
  await Promise.all([a.connect(), b.connect()]);
  assert.notEqual(a.processID, b.processID);
  const { rows } = await a.query(`select current_user as actor, current_database() as database,
    host(inet_server_addr()) as addr, to_regclass('public.assets') is null as fresh,
    not exists (select 1 from pg_roles where rolname in ('anon','authenticated','service_role')) as fresh_roles,
    (select rolsuper from pg_roles where rolname = current_user) as superuser`);
  assert.deepEqual(rows, [{ actor: "fixture_admin", database: "asset_catalog_fixture", addr: "127.0.0.1", fresh: true, fresh_roles: true, superuser: true }]);
  await a.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;`);
  for (const name of ["0001_foundation.sql", "0002_fix_fx_rate_cop.sql", "0003_auth_and_permissions.sql",
    "0009_role_aware_trades_imports_rls.sql", "0014_secure_portfolio_memberships.sql", "0015_secure_shared_asset_catalog.sql"]) {
    await a.query(sql(name));
  }
  await a.query(`insert into auth.users (id) values ($1), ($2), ($3)`, [owner, editor, outsider]);
  await a.query(`insert into public.portfolios (id,user_id,name) values ($1,$3,'Uno'), ($2,$4,'Dos')`, [portfolio, other, owner, outsider]);
  await a.query(`insert into public.portfolio_members (portfolio_id,user_id,role) values
    ($1,$3,'OWNER'), ($1,$4,'EDITOR'), ($2,$5,'OWNER')`, [portfolio, other, owner, editor, outsider]);
});

afterEach(async () => { await Promise.allSettled([a.query("rollback"), b.query("rollback")]); });
after(async () => { await Promise.allSettled([a.end(), b.end()]); });

async function beginAs(client, user, isolation = "READ COMMITTED") {
  await client.query(`begin isolation level ${isolation}`);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
  await client.query("set local role authenticated");
}

function resolve(client, target, ticker, exchange = "NASDAQ", currency = "USD") {
  return client.query("select public.resolve_asset_references($1,'MANUAL',null,$2::jsonb)->0 as result", [target,
    JSON.stringify([{ key: "a", ticker, decision: { kind: "new", exchange, currency, asset_type: "STOCK" } }]),
  ]).then(({ rows }) => rows[0].result);
}

async function whileBlocked(blocker, blocked, pending) {
  const outcome = pending.then((result) => ({ result }), (error) => ({ error }));
  const deadline = Date.now() + 3300;
  while (Date.now() < deadline) {
    const { rows } = await blocker.query("select $1 = any(pg_blocking_pids($2)) as blocked", [blocker.processID, blocked.processID]);
    if (rows[0].blocked) return { outcome };
    await setTimeout(20);
  }
  throw new Error("PostgreSQL no confirmó el bloqueo entre los dos PID distintos.");
}

async function rowsFor(ticker) {
  return (await a.query("select id, ticker, exchange, currency, asset_type, xmin::text as version from public.assets where ticker=$1 order by exchange", [ticker])).rows;
}

for (const [ticker, currency] of [["RACE1", "USD"], ["RACE2", "COP"]]) {
  test(`READ COMMITTED: resolución solapada USD frente a ${currency}`, async () => {
    await beginAs(a, owner);
    await beginAs(b, outsider);
    const winner = await resolve(a, portfolio, ticker);
    assert.equal(winner.status, "resolved");
    const before = await rowsFor(ticker);
    const { outcome } = await whileBlocked(a, b, resolve(b, other, ticker, "NASDAQ", currency));
    await a.query("commit");
    const rival = await outcome;
    assert.deepEqual(rival.result, currency === "USD" ? winner : { key: "a", status: "needs_disambiguation" });
    await b.query("commit");
    assert.equal(before.length, 1);
    assert.deepEqual(await rowsFor(ticker), before);
  });
}

test("el mismo ticker puede darse de alta simultáneamente en mercados distintos", async () => {
  await beginAs(a, owner);
  await beginAs(b, outsider);
  const first = await resolve(a, portfolio, "MKTRACE");
  const second = await resolve(b, other, "MKTRACE", "NYSE");
  assert.equal(first.status, "resolved");
  assert.equal(second.status, "resolved");
  assert.notEqual(first.asset_id, second.asset_id);
  await Promise.all([a.query("commit"), b.query("commit")]);
  assert.deepEqual((await rowsFor("MKTRACE")).map(({ id }) => id), [first.asset_id, second.asset_id]);
});

test("REPEATABLE READ: solo el reintento en una transacción nueva ve el UUID ganador", async () => {
  await beginAs(a, owner);
  await beginAs(b, outsider, "REPEATABLE READ");
  const winner = await resolve(a, portfolio, "SNAP1");
  const { outcome } = await whileBlocked(a, b, resolve(b, other, "SNAP1"));
  await a.query("commit");
  assert.equal((await outcome).error?.code, "40001");
  await b.query("rollback");
  await beginAs(b, outsider, "REPEATABLE READ");
  assert.deepEqual(await resolve(b, other, "SNAP1"), winner);
  await b.query("commit");
  assert.equal((await rowsFor("SNAP1")).length, 1);
});

const downgrade = (client) => client.query("select public.change_portfolio_member_role($1,$2,'VIEWER')", [portfolio, editor]);
const remove = (client) => client.query("select public.remove_portfolio_member($1,$2)", [portfolio, editor]);

test("una degradación que gana el bloqueo excluye el alta", async () => {
  await beginAs(a, owner);
  await beginAs(b, editor);
  await downgrade(a);
  const { outcome } = await whileBlocked(a, b, resolve(b, portfolio, "DENY1"));
  await a.query("commit");
  assert.equal((await outcome).error?.code, "42501");
  await b.query("rollback");
  assert.deepEqual(await rowsFor("DENY1"), []);
  await a.query("update public.portfolio_members set role = 'EDITOR' where portfolio_id = $1 and user_id = $2", [portfolio, editor]);
});

test("si gana el alta, la baja espera; una nueva llamada queda denegada", async () => {
  await beginAs(a, editor);
  await beginAs(b, owner);
  const created = await resolve(a, portfolio, "FIRST1");
  assert.equal(created.status, "resolved");
  const { outcome } = await whileBlocked(a, b, remove(b));
  await a.query("commit");
  assert.ok((await outcome).result);
  await b.query("commit");
  assert.equal((await rowsFor("FIRST1"))[0].id, created.asset_id);
  await beginAs(a, editor);
  await assert.rejects(resolve(a, portfolio, "DENY2"), { code: "42501" });
  await a.query("rollback");
  assert.deepEqual(await rowsFor("DENY2"), []);
});

test("dos operadores solapados solo rellenan los campos que siguen nulos", async () => {
  const identity = { ticker: "METARACE", exchange: "NASDAQ", currency: "USD", asset_type: "STOCK", yahoo_symbol: "METARACE" };
  const { rows: [{ id }] } = await a.query(`insert into public.assets (ticker, exchange, currency, asset_type, yahoo_symbol)
    values ($1, $2, $3, $4, $5) returning id`, Object.values(identity));
  const fill = (client, sector, country) => client.query(
    "select public.fill_missing_asset_metadata($1,$2::jsonb,$3,$4) as result", [id, JSON.stringify(identity), sector, country],
  ).then(({ rows }) => rows[0].result);
  for (const client of [a, b]) await client.query("begin; set local role asset_metadata_operator");
  assert.equal(await fill(a, "Primero", null), "updated");
  const { outcome } = await whileBlocked(a, b, fill(b, "Segundo", "US"));
  await a.query("commit");
  assert.equal((await outcome).result, "updated");
  assert.equal(await fill(b, "Tercero", "CO"), "no_change");
  await b.query("commit");
  const { rows } = await a.query("select id,ticker,exchange,currency,asset_type,yahoo_symbol,sector,country from public.assets where id=$1", [id]);
  assert.deepEqual(rows, [{ id, ...identity, sector: "Primero", country: "US" }]);
});

test("el comando local usa un login técnico y solo aplica metadatos de un perfil verificado", async (t) => {
  const login = "fixture_catalog_operator";
  const password = randomBytes(24).toString("hex");
  // Credencial temporal hex generada por esta fixture, no proviene de entrada externa.
  await a.query(`create role ${login} login password '${password}'; grant asset_metadata_operator to ${login};`);
  const identity = { ticker: "LOCALMETA", exchange: "BVC", currency: "COP", asset_type: "STOCK", yahoo_symbol: null };
  const { rows: [{ id }] } = await a.query(`insert into public.assets (ticker, exchange, currency, asset_type, yahoo_symbol, sector)
    values ($1,$2,$3,$4,$5,'Conservado') returning id`, Object.values(identity));
  const scratch = await mkdtemp(join(dirname(pwfile), "metadata-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const manifest = join(scratch, "manifest.json");
  const { yahoo_symbol: _unused, ...expected } = identity;
  await writeFile(manifest, JSON.stringify([{ id, ...expected, symbol: "LOCALMETA.CO" }]));

  const calls = [];
  let declaredError = null;
  const server = createServer((req, res) => {
    const symbol = new URL(req.url, "http://127.0.0.1").searchParams.get("symbol");
    calls.push(symbol);
    res.end(JSON.stringify({ quoteSummary: { error: declaredError, result: [{
      price: { symbol: "LOCALMETA.CO", exchange: "BVC", currency: "COP", quoteType: "EQUITY" },
      summaryProfile: { sector: "No reemplazar", country: "Colombia" },
    }] } }));
  });
  server.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, "listening");

  const run = (...args) => promisify(execFile)(process.execPath, ["scripts/enrich-asset-metadata.mjs", "--manifest", manifest, ...args], {
    timeout: 10000,
    env: { ...process.env, ASSET_METADATA_PG_HOST: "127.0.0.1", ASSET_METADATA_PG_PORT: port,
      ASSET_METADATA_PG_DATABASE: config.database, ASSET_METADATA_PG_USER: login, ASSET_METADATA_PG_PASSWORD: password,
      ASSET_METADATA_PG_MODULE: modulePath, ASSET_METADATA_PROFILE_ORIGIN: `http://127.0.0.1:${server.address().port}` },
  });
  assert.deepEqual(JSON.parse((await run()).stdout).results, [{ id, status: "planned" }]);
  assert.deepEqual(calls, []);

  // La identidad dedicada no puede compartir otras membresías, ni por herencia ni por SET ROLE.
  for (const options of ["WITH INHERIT FALSE, SET TRUE", "WITH INHERIT TRUE, SET FALSE"]) {
    await a.query(`create role unrelated_fixture_role; grant unrelated_fixture_role to ${login} ${options}`);
    await assert.rejects(run("--apply"), { code: 1 });
    assert.deepEqual(calls, []);
    await a.query("drop role unrelated_fixture_role");
  }
  await a.query(`grant asset_metadata_operator to ${login} with admin option`);
  await assert.rejects(run("--apply"), { code: 1 });
  assert.deepEqual(calls, []);
  await a.query(`revoke admin option for asset_metadata_operator from ${login}`);

  declaredError = { code: "fixture", description: "detalle no publicable" };
  await assert.rejects(run("--apply"), (error) => {
    assert.equal(error.code, 2);
    assert.deepEqual(JSON.parse(error.stdout).results, [{ id, status: "provider_error" }]);
    assert.doesNotMatch(error.stdout, /detalle no publicable/);
    return true;
  });
  assert.deepEqual(calls.splice(0), ["LOCALMETA.CO"]);
  assert.equal((await a.query("select country from public.assets where id = $1", [id])).rows[0].country, null);
  declaredError = null;
  assert.deepEqual(JSON.parse((await run("--apply")).stdout).results, [{ id, status: "updated" }]);
  assert.deepEqual(calls, ["LOCALMETA.CO"]);
  const { rows } = await a.query("select id,ticker,exchange,currency,asset_type,yahoo_symbol,sector,country from public.assets where id=$1", [id]);
  assert.deepEqual(rows, [{ id, ...identity, sector: "Conservado", country: "Colombia" }]);
});
