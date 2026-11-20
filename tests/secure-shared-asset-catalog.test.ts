// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const readMigration = (name: string) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const install = (db: PGlite) => db.exec(readMigration("0015_secure_shared_asset_catalog.sql"));
const owner = "10000000-0000-4000-8000-000000000001";
const editor = "10000000-0000-4000-8000-000000000002";
const viewer = "10000000-0000-4000-8000-000000000003";
const outsider = "10000000-0000-4000-8000-000000000004";
const portfolio = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const legacy = "a0000000-0000-4000-8000-000000000001";
const draft = "30000000-0000-4000-8000-000000000001";
const foreignDraft = "30000000-0000-4000-8000-000000000002";
const completed = "30000000-0000-4000-8000-000000000003";
const validRow = "40000000-0000-4000-8000-000000000001";
const foreignRow = "40000000-0000-4000-8000-000000000002";
const invalidRow = "40000000-0000-4000-8000-000000000003";
const item = (ticker: string, key = ticker, exchange = "NASDAQ") =>
  ({ key, ticker, decision: { kind: "new", exchange, currency: "USD", asset_type: "STOCK" } });

type Resolution = { key: string; status: string; asset_id?: string };

async function createFixture(db: PGlite) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create role authenticator noinherit;
    grant anon, authenticated, service_role to authenticator;
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
    "create extension if not exists pgcrypto with schema extensions;", "",
  ));
  for (const name of [
    "0002_fix_fx_rate_cop.sql", "0003_auth_and_permissions.sql", "0004_market_data_sync.sql",
    "0009_role_aware_trades_imports_rls.sql", "0014_secure_portfolio_memberships.sql",
  ]) await db.exec(readMigration(name));
  await db.query(`insert into auth.users (id) values ($1), ($2), ($3), ($4)`, [owner, editor, viewer, outsider]);
  await db.query(`insert into public.portfolios (id, user_id, name) values ($1, $3, 'Uno'), ($2, $4, 'Dos')`,
    [portfolio, other, owner, outsider]);
  await db.query(`insert into public.portfolio_members (portfolio_id, user_id, role) values
    ($1, $3, 'OWNER'), ($1, $4, 'EDITOR'), ($1, $5, 'VIEWER'), ($2, $6, 'OWNER')`,
    [portfolio, other, owner, editor, viewer, outsider]);
  await db.query(`insert into public.assets (id, ticker, asset_type, name) values ($1, 'OLD', 'STOCK', 'Legado')`, [legacy]);
  await db.query(`insert into public.trades (portfolio_id, broker_id, asset_id, trade_date, trade_type,
    quantity, price_original, currency_original, price_usd, total_invested_usd, source)
    select $1, id, $2, '2026-01-01', 'BUY', 1, 50, 'USD', 50, 50, 'MANUAL'
    from public.brokers where code = 'ETORO'`, [portfolio, legacy]);
  await db.exec(`insert into public.market_prices (asset_id, price, currency, price_usd, source, observed_at)
    select id, 100, 'USD', 100, 'BENCHMARK', '2026-01-01' from public.assets where ticker = '^GSPC'`);
  await db.query(`insert into public.csv_imports (id, portfolio_id, broker_id, file_name, status)
    select d.id, d.portfolio_id, b.id, 'fixture.csv', d.status from public.brokers as b cross join
    (values ($1::uuid, $4::uuid, 'PREVIEWED'), ($2, $5, 'PREVIEWED'), ($3, $4, 'COMMITTED')) as d(id, portfolio_id, status)
    where b.code = 'ETORO'`, [draft, foreignDraft, completed, portfolio, other]);
  await db.query(`insert into public.csv_import_rows (id, import_id, row_number, raw_data_json, parsed_data_json, validation_status)
    values ($1, $4, 1, '{}', '{"ticker":"  CSV1  "}', 'VALID'),
    ($2, $5, 1, '{}', '{"ticker":"CSV1"}', 'VALID'),
    ($3, $4, 2, '{}', '{"ticker":"CSV1"}', 'INVALID')`, [validRow, foreignRow, invalidRow, draft, foreignDraft]);
}

describe("frontera SQL del catálogo compartido", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await createFixture(db);
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  const archivedPolicies = `
    create policy "authenticated can insert assets" on public.assets for insert to authenticated with check (true);
    create policy "authenticated can update assets" on public.assets for update to authenticated using (true);
  `;

  it("proyecta candidatos normalizados por lote con truncación explícita y sin elevación", async () => {
    await install(db);
    try {
      await db.exec(`insert into public.assets (ticker, name, asset_type)
        select '  TeSTCAT  ', 'Referencia de prueba', 'STOCK' from generate_series(1, 11)`);
      await db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        const result = await tx.query<{ data: Array<{ ticker: string; candidates: Array<{ ticker: string }>; truncated: boolean }> }>(
          "select public.list_asset_reference_candidates(array[' testcat ', 'TESTCAT', 'UNKNOWN']) as data",
        );
        expect(result.rows[0].data).toMatchObject([
          { ticker: "TESTCAT", truncated: true }, { ticker: "UNKNOWN", candidates: [], truncated: false },
        ]);
        expect(result.rows[0].data[0].candidates).toHaveLength(10);
        expect(result.rows[0].data[0].candidates.every(({ ticker }) => ticker === "  TeSTCAT  ")).toBe(true);
      });
      await expect(db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query("select public.list_asset_reference_candidates(array['TESTCAT'])");
      })).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("delete from public.assets where ticker = '  TeSTCAT  '");
    }
  });

  it("conserva lectura, benchmark y claves foráneas con o sin grants y políticas antiguas", async () => {
    const references = await db.query(`select asset_id from public.trades union all select asset_id from public.market_prices order by 1`);
    await install(db);
    await db.exec(archivedPolicies);
    await db.exec(`
      grant insert, update, delete, truncate, references, trigger on public.assets to public, anon, authenticated, service_role;
      grant insert (ticker), update (sector), references (id) on public.assets to public, authenticated, service_role;
      grant insert on public.market_prices to service_role;
    `);
    await install(db);
    const roles = await db.query(`select rolname, has_table_privilege(oid, 'public.assets', 'SELECT') as read,
      has_table_privilege(oid, 'public.assets', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as dml,
      has_any_column_privilege(oid, 'public.assets', 'INSERT, UPDATE, REFERENCES') as columns
      from pg_roles where rolname in ('anon','authenticated','service_role') order by rolname`);
    expect(roles.rows).toEqual(["anon", "authenticated", "service_role"].map((rolname) => ({ rolname, read: true, dml: false, columns: false })));
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        expect((await tx.query('select ticker from public.assets order by ticker collate "C"')).rows).toEqual([{ ticker: "OLD" }, { ticker: "^GSPC" }]);
      });
    }
    expect((await db.query(`select relrowsecurity as rls,
      exists (select 1 from pg_policy where polrelid = oid and polname like 'authenticated can % assets') as old_policies,
      has_table_privilege('service_role', 'public.market_prices', 'INSERT') as worker_writes
      from pg_class where oid = 'public.assets'::regclass`)).rows).toEqual([{ rls: true, old_policies: false, worker_writes: true }]);
    expect(await db.query(`select asset_id from public.trades union all select asset_id from public.market_prices order by 1`)).toEqual(references);
  });

  it("aborta y revierte sus cambios ante permisos heredados o asumibles no autorizados", async () => {
    for (const options of ["with inherit true, set false", "with inherit false, set true"]) {
      await db.exec(`create role fixture_catalog_group;
        grant fixture_catalog_group to authenticated ${options};
        grant update (name) on public.assets to fixture_catalog_group;
        ${archivedPolicies}`);
      await expect(install(db)).rejects.toMatchObject({ message: "asset_catalog_unexpected_privileges" });
      await db.exec("rollback");
      expect((await db.query(`select count(*)::int as count from pg_policy
        where polrelid = 'public.assets'::regclass and polname like 'authenticated can % assets'`)).rows).toEqual([{ count: 2 }]);
      await db.exec(`revoke update (name) on public.assets from fixture_catalog_group;
        drop role fixture_catalog_group;
        drop policy "authenticated can insert assets" on public.assets;
        drop policy "authenticated can update assets" on public.assets;`);
    }
  });

  it("rechaza un rol interno preexistente con atributos o membresías inesperados", async () => {
    await db.exec("alter role asset_catalog_writer bypassrls");
    await expect(install(db)).rejects.toMatchObject({ message: "asset_catalog_unexpected_internal_role" });
    await db.exec("rollback; alter role asset_catalog_writer nobypassrls");
    await db.exec("grant asset_catalog_writer to service_role");
    await expect(install(db)).rejects.toMatchObject({ message: "asset_catalog_unexpected_privileges" });
    await db.exec("rollback; revoke asset_catalog_writer from service_role");
  });

  function rpc(user: string, items: unknown, { target = portfolio, source = "MANUAL", importId = null as string | null,
    role = "authenticated" } = {}) {
    return db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
      await tx.exec(`set local role ${role}`);
      const { rows } = await tx.query<{ result: Resolution[] }>(
        "select public.resolve_asset_references($1,$2,$3,$4::jsonb) as result", [target, source, importId, JSON.stringify(items)],
      );
      return rows[0].result;
    });
  }

  it("permite OWNER/EDITOR vigentes y deniega VIEWER, ajeno, sin UID, revocado y roles de runtime", async () => {
    for (const user of [owner, editor]) {
      expect(await rpc(user, [item(user === owner ? "OWNER1" : "EDITOR1")])).toEqual([
        { key: user === owner ? "OWNER1" : "EDITOR1", status: "resolved", asset_id: expect.any(String) },
      ]);
    }
    for (const user of [viewer, outsider, ""]) {
      await expect(rpc(user, [item("DENIED")])).rejects.toMatchObject({ code: "42501" });
    }
    for (const role of ["anon", "service_role", "asset_metadata_operator"]) {
      await expect(rpc(owner, [item("DENIED")], { role })).rejects.toMatchObject({ code: "42501" });
    }
    await expect(rpc(editor, [item("DENIED")], { target: other })).rejects.toMatchObject({ code: "42501" });
    await db.query("delete from public.portfolio_members where portfolio_id = $1 and user_id = $2", [portfolio, editor]);
    try {
      await expect(rpc(editor, [item("DENIED")])).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.query("insert into public.portfolio_members (portfolio_id, user_id, role) values ($1, $2, 'EDITOR')", [portfolio, editor]);
    }
    expect((await db.query("select id from public.assets where ticker = 'DENIED'")).rows).toEqual([]);
  });

  it("valida borrador y pertenencia, estado, ticker y unicidad de filas CSV antes de altas", async () => {
    const valid = { ...item("CSV1"), row_ids: [validRow] };
    expect(await rpc(editor, [valid], { source: "CSV", importId: draft })).toEqual([
      { key: "CSV1", status: "resolved", asset_id: expect.any(String) },
    ]);
    for (const importId of [foreignDraft, completed]) {
      await expect(rpc(editor, [valid], { source: "CSV", importId })).rejects.toMatchObject({ code: "42501" });
    }
    for (const row_ids of [[foreignRow], [invalidRow], ["40000000-0000-4000-8000-000000000004"]]) {
      await expect(rpc(editor, [{ ...valid, row_ids }], { source: "CSV", importId: draft })).rejects.toMatchObject({ code: "42501" });
    }
    await expect(rpc(editor, [{ ...valid, ticker: "WRONG" }], { source: "CSV", importId: draft })).rejects.toMatchObject({ code: "42501" });
    for (const items of [[{ ...valid, row_ids: [validRow, validRow] }], [valid, { ...valid, key: "second" }], [{ ...valid, row_ids: [] }]]) {
      await expect(rpc(editor, items, { source: "CSV", importId: draft })).rejects.toMatchObject({ code: "22023" });
    }
    expect((await db.query("select id from public.assets where ticker = 'WRONG'")).rows).toEqual([]);
  });

  it("rechaza el lote entero si excede cupos o contiene campos, claves y tipos no admitidos", async () => {
    const first = { ...item("ATOMIC"), row_ids: [validRow] };
    const csv = { source: "CSV", importId: draft };
    for (const invalid of [
      [first, { ...first, ticker: "NEXT" }],
      [first, { ...first, key: "bad", decision: { ...first.decision, sector: "No admitido" } }],
      [first, { ...first, key: "bad", ticker: 3 }],
      [first, { ...first, key: "x".repeat(65) }],
      [first, { ...first, key: "bad", decision: { kind: "existing", asset_id: "no-uuid" } }],
      [{ ...first, row_ids: Array(501).fill(validRow) }],
      Array.from({ length: 501 }, (_, n) => ({ ...first, key: `${n}` })),
      [{ ...first, key: "x".repeat(262_145) }],
      [first, { ...first, key: "bad", yahoo_symbol: "NO" }],
    ]) await expect(rpc(owner, invalid, csv)).rejects.toMatchObject({ code: "22023" });
    for (const items of [[], [item("ATOMIC"), item("SECOND")], [first], null, { key: "x" }]) {
      await expect(rpc(owner, items)).rejects.toMatchObject({ code: "22023" });
    }
    expect((await db.query("select id from public.assets where ticker = 'ATOMIC'")).rows).toEqual([]);
  });

  it("requiere decisión explícita; conserva los UUID históricos y distingue ticker y mercados confirmados", async () => {
    const original = await db.query("select * from public.assets where id = $1", [legacy]);
    const existing = { key: "picked", ticker: " \told\r", decision: { kind: "existing", asset_id: legacy } };
    expect(await rpc(owner, [existing])).toEqual([{ key: "picked", status: "resolved", asset_id: legacy }]);
    for (const candidate of [{ key: "bare", ticker: "OLD" }, item("OLD"),
      { ...existing, decision: { ...existing.decision, exchange: "NYSE" } }, { ...existing, ticker: "DIFFERENT" }]) {
      expect(await rpc(owner, [candidate])).toEqual([{ key: candidate.key, status: "needs_disambiguation" }]);
    }
    const first = await rpc(owner, [item("  mkt1\t", "one", "  nasdaq  ")]);
    const second = await rpc(editor, [item("MKT1", "two", "NYSE")]);
    expect(first).toEqual([{ key: "one", status: "resolved", asset_id: expect.any(String) }]);
    expect(second).toEqual([{ key: "two", status: "resolved", asset_id: expect.any(String) }]);
    expect(first[0].asset_id).not.toBe(second[0].asset_id);
    expect(await rpc(editor, [item("MKT1", "reuse")])).toEqual([{ key: "reuse", status: "resolved", asset_id: first[0].asset_id }]);
    expect(await rpc(editor, [{ key: "bare", ticker: "MKT1" }])).toEqual([{ key: "bare", status: "needs_disambiguation" }]);
    expect(await db.query("select * from public.assets where id = $1", [legacy])).toEqual(original);
  });

  it("no corrige ni elige duplicados normalizados, clases, monedas o mercados contradictorios", async () => {
    const { rows: unusual } = await db.query<{ id: string }>(`insert into public.assets (ticker, exchange, currency, asset_type) values
      ('ODD?', ' HISTÓRICO ', 'COP', 'CRYPTO_FUTURE'), ('Dupe1','nasdaq','USD','STOCK'), ('DUPE1','NASDAQ','USD','STOCK'),
      ('UNIQUE1',' nyse ','COP','ETF') returning id`);
    const snapshot = await db.query("select *, xmin::text as version from public.assets order by id");
    const unusualSelection = { key: "legacy", ticker: " odd? ", decision: { kind: "existing", asset_id: unusual[0].id, exchange: " HISTÓRICO ", currency: "cop", asset_type: "crypto_future" } };
    expect(await rpc(owner, [unusualSelection])).toEqual([{ key: "legacy", status: "resolved", asset_id: unusual[0].id }]);
    for (const candidate of [item("DUPE1"), item("UNIQUE1", "currency/class", "NYSE"),
      { ...item("UNIQUE1", "currency", "NYSE"), decision: { ...item("UNIQUE1", "currency", "NYSE").decision, asset_type: "ETF" } },
    ]) expect(await rpc(owner, [candidate])).toEqual([{ key: candidate.key, status: "needs_disambiguation" }]);
    const match = item("UNIQUE1", "match", "NYSE");
    expect(await rpc(owner, [{ ...match, decision: { ...match.decision, currency: "COP", asset_type: "ETF" } }]))
      .toEqual([{ key: "match", status: "resolved", asset_id: unusual[3].id }]);
    for (const candidate of [item("^GSPC"), item("Z".repeat(33)), item("BAD", "invalid", "OTHER"),
      { ...unusualSelection, decision: { ...unusualSelection.decision, asset_id: "a0000000-0000-4000-8000-000000000099" } }]) {
      expect(await rpc(owner, [candidate])).toEqual([{ key: candidate.key, status: "invalid_reference" }]);
    }
    expect(await db.query("select *, xmin::text as version from public.assets order by id")).toEqual(snapshot);
  });

  it("marca todas las propuestas incompatibles del mismo mercado sin afectar otros mercados del lote", async () => {
    const { rows } = await db.query<{ id: string }>(`insert into public.csv_import_rows
      (import_id, row_number, raw_data_json, parsed_data_json, validation_status)
      select $1, n, '{}', '{"ticker":"MULTI1"}', 'VALID' from generate_series(10,13) as n returning id`, [draft]);
    const first = item("MULTI1", "first");
    const second = { ...item("multi1", "second", "nasdaq"), decision: { ...first.decision, currency: "COP" } };
    const third = item("MULTI1", "third", "NYSE");
    const fourth = item("MULTI1", "fourth", "NYSE");
    const results = await rpc(editor, [first, second, third, fourth].map((entry, n) => ({ ...entry, row_ids: [rows[n].id] })), { source: "CSV", importId: draft });
    expect(results).toEqual([
      { key: "first", status: "needs_disambiguation" }, { key: "second", status: "needs_disambiguation" },
      { key: "third", status: "resolved", asset_id: expect.any(String) }, { key: "fourth", status: "resolved", asset_id: results[2].asset_id },
    ]);
    expect((await db.query("select ticker, exchange from public.assets where ticker = 'MULTI1'")).rows)
      .toEqual([{ ticker: "MULTI1", exchange: "NYSE" }]);
  });

  it("solo marca altas RPC y conserva legado, seeds y acceso de lectura del worker", async () => {
    const decision = item("QUOTE1");
    await expect(rpc(owner, [{ ...decision, requires_verified_quote_symbol: false }])).rejects.toMatchObject({ code: "22023" });
    await expect(rpc(owner, [{ ...decision, decision: { ...decision.decision, requires_verified_quote_symbol: false } }]))
      .rejects.toMatchObject({ code: "22023" });
    const [{ asset_id }] = await rpc(owner, [decision]);
    expect(asset_id).toEqual(expect.any(String));
    await db.exec(`insert into public.assets (ticker, asset_type, exchange) values ('SEED1', 'STOCK', 'BVC')`);
    const state = await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return tx.query(`select ticker, name, yahoo_symbol, sector, country, requires_verified_quote_symbol as required
        from public.assets where ticker in ('^GSPC', 'OLD', 'QUOTE1', 'SEED1') order by ticker collate "C"`);
    });
    expect(state.rows).toEqual([
      { ticker: "OLD", name: "Legado", yahoo_symbol: null, sector: null, country: null, required: false },
      { ticker: "QUOTE1", name: "QUOTE1", yahoo_symbol: null, sector: null, country: null, required: true },
      { ticker: "SEED1", name: null, yahoo_symbol: null, sector: null, country: null, required: false },
      { ticker: "^GSPC", name: "S&P 500", yahoo_symbol: "^GSPC", sector: null, country: "US", required: false },
    ]);
    expect((await db.query(`select rolname from pg_roles where rolname in
      ('anon','authenticated','service_role','asset_metadata_operator','asset_metadata_writer','asset_catalog_writer')
      and (has_column_privilege(oid,'public.assets','requires_verified_quote_symbol','UPDATE')
        or has_column_privilege(oid,'public.assets','yahoo_symbol','UPDATE'))`)).rows).toEqual([]);
    await expect(db.transaction(async (tx) => {
      await tx.exec("set local role asset_catalog_writer");
      await tx.exec(`insert into public.assets (ticker, asset_type, exchange) values ('UNMARKED', 'STOCK', 'BVC')`);
    })).rejects.toMatchObject({ code: "42501" });
  });

  const fill = (role: string, id: string, identity: unknown, sector: string | null, country: string | null) =>
    db.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      const { rows } = await tx.query<{ result: string }>(
        "select public.fill_missing_asset_metadata($1,$2::jsonb,$3,$4) as result", [id, JSON.stringify(identity), sector, country],
      );
      return rows[0].result;
    });

  it("reserva el relleno al operador y solo actualiza metadatos aún nulos de la identidad exacta", async () => {
    const { rows: [asset] } = await db.query<{ id: string }>(`insert into public.assets (ticker, yahoo_symbol, exchange, asset_type, sector)
      values ('PROFILE1','PROFILE1.US','NASDAQ','STOCK','Original') returning id`);
    const identity = { ticker: "PROFILE1", exchange: "NASDAQ", currency: "USD", asset_type: "STOCK", yahoo_symbol: "PROFILE1.US" };
    const operator = "asset_metadata_operator";
    for (const role of ["anon", "authenticated", "service_role", "asset_catalog_writer"]) {
      await expect(fill(role, asset.id, identity, null, "CO")).rejects.toMatchObject({ code: "42501" });
    }
    for (const changed of [{ yahoo_symbol: null }, { ticker: "profile1" }, { exchange: "BVC" }, { currency: "COP" }, { asset_type: "ETF" }]) {
      expect(await fill(operator, asset.id, { ...identity, ...changed }, "No", "XX")).toBe("identity_changed");
    }
    expect(await fill(operator, asset.id, identity, "No reemplazar", "US")).toBe("updated");
    expect(await fill(operator, asset.id, identity, "No reemplazar", "CO")).toBe("no_change");
    expect((await db.query("select id, ticker, exchange, currency, asset_type, yahoo_symbol, sector, country from public.assets where id=$1", [asset.id])).rows)
      .toEqual([{ id: asset.id, ...identity, sector: "Original", country: "US" }]);
  });

  it("rechaza metadatos o identidad mal formados y no asigna símbolos a referencias nuevas", async () => {
    const [{ asset_id }] = await rpc(owner, [item("PROFILE2")]);
    const id = asset_id!;
    const identity = { ticker: "PROFILE2", exchange: "NASDAQ", currency: "USD", asset_type: "STOCK", yahoo_symbol: null };
    const operator = "asset_metadata_operator";
    const { yahoo_symbol, ...incomplete } = identity;
    expect(yahoo_symbol).toBeNull();
    for (const invalid of [incomplete, { ...identity, id }, { ...identity, exchange: null }, { ...identity, ticker: 12 }]) {
      await expect(fill(operator, id, invalid, "Sector", "CO")).rejects.toMatchObject({ code: "22023" });
    }
    for (const [sector, country] of [["", "CO"], [" \t", "CO"], ["In\nvalid", "CO"], ["S".repeat(129), "CO"], [null, "C".repeat(65)], [null, "\u007f"]]) {
      await expect(fill(operator, id, identity, sector, country)).rejects.toMatchObject({ code: "22023" });
    }
    expect(await fill(operator, id, identity, " Tecnología ", null)).toBe("updated");
    expect((await db.query("select yahoo_symbol, sector, country, requires_verified_quote_symbol from public.assets where id=$1", [id])).rows)
      .toEqual([{ yahoo_symbol: null, sector: "Tecnología", country: null, requires_verified_quote_symbol: true }]);
  });
});
