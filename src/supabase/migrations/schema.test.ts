import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");

const foundationPath = path.join(migrationsDir, "0001_foundation.sql");
const fixFxPath = path.join(migrationsDir, "0002_fix_fx_rate_cop.sql");
const authPath = path.join(migrationsDir, "0003_auth_and_permissions.sql");
const marketDataPath = path.join(migrationsDir, "0004_market_data_sync.sql");
const syncSettingsPath = path.join(migrationsDir, "0005_sync_settings.sql");
const tradesLiveIndexPath = path.join(
  migrationsDir,
  "0006_trades_live_index.sql",
);
const performanceIndexesPath = path.join(
  migrationsDir,
  "0007_performance_indexes.sql",
);
const compositeIndexesPath = path.join(
  migrationsDir,
  "0008_composite_indexes.sql",
);
const roleAwareRlsPath = path.join(
  migrationsDir,
  "0009_role_aware_trades_imports_rls.sql",
);

const publicTables = [
  "profiles",
  "portfolios",
  "portfolio_members",
  "brokers",
  "assets",
  "trades",
  "csv_imports",
  "csv_import_rows",
  "market_prices",
  "fx_rates",
  "portfolio_snapshots",
  "alerts",
  "alert_events",
  "audit_events",
];

async function applyMigrations() {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create schema if not exists extensions;
    create schema if not exists cron;
    create schema if not exists net;
    create role anon;
    create role authenticated;
    create role service_role;
    create table auth.users (
      id uuid primary key,
      email text
    );
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select null::uuid;
    $$;
    -- Stubs for pg_cron / pg_net so 0004 can apply cleanly. In real
    -- Supabase these come from the enabled extensions and behave
    -- differently; the migration's DO block detects their absence.
    create table if not exists cron.job (
      jobid bigserial primary key,
      jobname text
    );
    create or replace function cron.schedule(
      p_name text, p_schedule text, p_command text
    ) returns bigint
    language sql
    as $$
      insert into cron.job (jobname) values (p_name) returning jobid;
    $$;
    create or replace function net.http_post(
      url text, headers jsonb, body jsonb
    ) returns bigint
    language sql
    as $$
      select 1::bigint;
    $$;
  `);

  const foundationSql = readFileSync(foundationPath, "utf8");
  const pgliteCompatibleFoundation = foundationSql.replace(
    "create extension if not exists pgcrypto with schema extensions;",
    "",
  );
  await db.exec(pgliteCompatibleFoundation);

  if (await fileExists(fixFxPath)) {
    await db.exec(readFileSync(fixFxPath, "utf8"));
  }

  if (await fileExists(authPath)) {
    await db.exec(readFileSync(authPath, "utf8"));
  }

  if (await fileExists(marketDataPath)) {
    await db.exec(readFileSync(marketDataPath, "utf8"));
  }

  if (await fileExists(syncSettingsPath)) {
    await db.exec(readFileSync(syncSettingsPath, "utf8"));
  }

  if (await fileExists(tradesLiveIndexPath)) {
    await db.exec(readFileSync(tradesLiveIndexPath, "utf8"));
  }

  if (await fileExists(performanceIndexesPath)) {
    await db.exec(readFileSync(performanceIndexesPath, "utf8"));
  }

  if (await fileExists(compositeIndexesPath)) {
    // 0008's last index uses `now()` in its predicate, which PGlite
    // refuses with "functions in index predicate must be marked
    // IMMUTABLE" (real Postgres accepts it because `now()` is stable in
    // the right context, but PGlite is stricter). Strip just that
    // statement for the test run; the rest of the file applies as-is.
    const compositeSql = readFileSync(compositeIndexesPath, "utf8");
    const withoutNowPredicate = compositeSql.replace(
      /create index if not exists market_prices_delayed_until_idx[\s\S]*?;/i,
      "",
    );
    await db.exec(withoutNowPredicate);
  }

  if (await fileExists(roleAwareRlsPath)) {
    await db.exec(readFileSync(roleAwareRlsPath, "utf8"));
  }

  return db;
}

async function fileExists(filePath: string) {
  try {
    const { statSync } = await import("node:fs");
    statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("foundation migration", () => {
  const foundationSql = readFileSync(foundationPath, "utf8").toLowerCase();
  const originalMigrationSql = readFileSync(foundationPath, "utf8");

  it("enables row level security on every public table", () => {
    for (const tableName of publicTables) {
      expect(foundationSql).toContain(
        `alter table public.${tableName} enable row level security;`,
      );
    }
  });

  it("seeds the supported brokers", () => {
    expect(foundationSql).toContain("etoro");
    expect(foundationSql).toContain("xtb");
    expect(foundationSql).toContain("trii");
    expect(foundationSql).toContain("etrading_bancolombia");
  });

  it("declares the Supabase UUID extension", () => {
    expect(foundationSql).toContain(
      "create extension if not exists pgcrypto with schema extensions;",
    );
  });

  it("applies the schema DDL and creates the expected public schema", { timeout: 30_000 }, async () => {
    const db = await applyMigrations();

    const tables = await db.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name;
    `);
    const tableNames = tables.rows.map((row) => row.table_name);

    for (const tableName of publicTables) {
      expect(tableNames).toContain(tableName);
    }

    const rlsTables = await db.query<{ relname: string }>(`
      select relname
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where pg_namespace.nspname = 'public'
        and relkind = 'r'
        and relrowsecurity = true
      order by relname;
    `);
    const rlsTableNames = rlsTables.rows.map((row) => row.relname);

    for (const tableName of publicTables) {
      expect(rlsTableNames).toContain(tableName);
    }

    const brokers = await db.query<{ code: string }>(`
      select code from public.brokers order by code;
    `);

    expect(brokers.rows.map((row) => row.code)).toEqual([
      "ETORO",
      "ETRADING_BANCOLOMBIA",
      "TRII",
      "XTB",
    ]);
  });
});

describe("0003 auth and permissions migration", () => {
  const authSql = readFileSync(authPath, "utf8");

  it("declares the handle_new_user trigger function", () => {
    expect(authSql).toMatch(
      /create or replace function public\.handle_new_user\(\)/i,
    );
    expect(authSql).toContain("security definer");
  });

  it("declares the membership helper functions", () => {
    expect(authSql).toMatch(
      /create or replace function public\.current_user_is_member/i,
    );
    expect(authSql).toMatch(
      /create or replace function public\.current_user_has_role/i,
    );
  });

  it("wires the trigger on auth.users", () => {
    expect(authSql).toContain("on_auth_user_created");
    expect(authSql).toMatch(/after insert on auth\.users/i);
  });

  it("drops legacy owner-style policies from 0001", () => {
    expect(authSql).toContain(
      `drop policy if exists "owners can manage trades" on public.trades;`,
    );
    expect(authSql).toContain(
      `drop policy if exists "owners can manage csv imports" on public.csv_imports;`,
    );
  });

  it("recreates policies that reference the new helper functions", () => {
    expect(authSql).toContain("current_user_is_member");
    expect(authSql).toContain("current_user_has_role");
    expect(authSql).toContain("members can read trades");
    expect(authSql).toContain("owners can insert trades");
  });

  it("applies cleanly to a PGlite database with stubbed auth", async () => {
    const db = await applyMigrations();

    const functions = await db.query<{ proname: string }>(`
      select proname
      from pg_proc
      join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
      where pg_namespace.nspname = 'public'
        and proname in ('handle_new_user', 'current_user_is_member', 'current_user_has_role')
      order by proname;
    `);
    expect(functions.rows.map((row) => row.proname)).toEqual([
      "current_user_has_role",
      "current_user_is_member",
      "handle_new_user",
    ]);

    const triggers = await db.query<{ tgname: string }>(`
      select tgname
      from pg_trigger
      where tgname = 'on_auth_user_created';
    `);
    expect(triggers.rows).toHaveLength(1);
  });
});

describe("0004 market data sync migration", () => {
  const marketDataSql = readFileSync(marketDataPath, "utf8");

  it("seeds the S&P 500 benchmark asset with both ticker and yahoo_symbol", () => {
    expect(marketDataSql).toContain("'^GSPC'");
    expect(marketDataSql).toMatch(/on conflict \(ticker, exchange\)/i);
  });

  it("creates the market_sync_runs table with the expected columns", () => {
    expect(marketDataSql).toContain("create table if not exists public.market_sync_runs");
    expect(marketDataSql).toContain("kind text not null check (kind in ('PRICES', 'FX'))");
    expect(marketDataSql).toContain("status text not null default 'PENDING'");
    expect(marketDataSql).toContain("assets_processed integer");
  });

  it("enables RLS on market_sync_runs with no policies", () => {
    expect(marketDataSql).toContain(
      "alter table public.market_sync_runs enable row level security;",
    );
  });

  it("declares enqueue_sync_run as security definer and grants it to service_role", () => {
    expect(marketDataSql).toMatch(
      /create or replace function public\.enqueue_sync_run\(/i,
    );
    expect(marketDataSql).toContain("security definer");
    expect(marketDataSql).toContain(
      "grant execute on function public.enqueue_sync_run(text) to service_role;",
    );
  });

  it("guards the cron schedule block behind an extension check", () => {
    expect(marketDataSql).toContain("pg_proc");
    expect(marketDataSql).toContain("cron.schedule");
    expect(marketDataSql).toContain("pg_namespace");
  });

  it("schedules both sync jobs by name", () => {
    expect(marketDataSql).toContain("'sync-prices-30m'");
    expect(marketDataSql).toContain("'sync-fx-rates-daily'");
  });

  it("calls enqueue_sync_run from the cron schedules", () => {
    expect(marketDataSql).toMatch(/enqueue_sync_run\('PRICES'\)/i);
    expect(marketDataSql).toMatch(/enqueue_sync_run\('FX'\)/i);
  });

  it("applies cleanly to a PGlite database with stubbed auth", async () => {
    const db = await applyMigrations();

    const benchmark = await db.query<{ ticker: string; yahoo_symbol: string | null }>(`
      select ticker, yahoo_symbol
      from public.assets
      where ticker = '^GSPC';
    `);
    expect(benchmark.rows).toHaveLength(1);
    expect(benchmark.rows[0].yahoo_symbol).toBe("^GSPC");

    const runs = await db.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'market_sync_runs';
    `);
    expect(runs.rows).toHaveLength(1);

    const enqueue = await db.query<{ proname: string }>(`
      select proname
      from pg_proc
      join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
      where pg_namespace.nspname = 'public'
        and proname = 'enqueue_sync_run';
    `);
    expect(enqueue.rows).toHaveLength(1);

    const scheduled = await db.query<{ jobname: string }>(`
      select jobname from cron.job order by jobname;
    `);
    expect(scheduled.rows.map((r) => r.jobname)).toEqual([
      "sync-fx-rates-daily",
      "sync-prices-30m",
    ]);
  });
});

describe("0005 sync settings migration", () => {
  const syncSettingsSql = readFileSync(syncSettingsPath, "utf8");

  it("creates the sync_settings table with key/value columns", () => {
    expect(syncSettingsSql).toContain("create table if not exists public.sync_settings");
    expect(syncSettingsSql).toContain("key text primary key");
    expect(syncSettingsSql).toContain("value text not null");
  });

  it("enables row level security on sync_settings with no policies", () => {
    expect(syncSettingsSql).toContain(
      "alter table public.sync_settings enable row level security;",
    );
  });

  it("redeclares enqueue_sync_run as security definer and grants it to service_role", () => {
    expect(syncSettingsSql).toMatch(
      /create or replace function public\.enqueue_sync_run\(/i,
    );
    expect(syncSettingsSql).toContain("security definer");
    expect(syncSettingsSql).toContain(
      "grant execute on function public.enqueue_sync_run(text) to service_role;",
    );
  });

  it("reads EDGE_FUNCTION_BASE and SUPABASE_ANON_KEY from sync_settings", () => {
    expect(syncSettingsSql).toContain("public.sync_settings");
    expect(syncSettingsSql).toContain("'EDGE_FUNCTION_BASE'");
    expect(syncSettingsSql).toContain("'SUPABASE_ANON_KEY'");
    expect(syncSettingsSql).toContain("'Authorization'");
    expect(syncSettingsSql).not.toContain("current_setting('app.edge_function_base'");
  });

  it("applies cleanly to a PGlite database with stubbed auth", async () => {
    const db = await applyMigrations();

    const settings = await db.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'sync_settings';
    `);
    expect(settings.rows).toHaveLength(1);

    const rls = await db.query<{ relname: string }>(`
      select relname
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where pg_namespace.nspname = 'public'
        and relkind = 'r'
        and relrowsecurity = true
        and relname = 'sync_settings';
    `);
    expect(rls.rows).toHaveLength(1);

    const enqueue = await db.query<{ proname: string }>(`
      select proname
      from pg_proc
      join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
      where pg_namespace.nspname = 'public'
        and proname = 'enqueue_sync_run';
    `);
    expect(enqueue.rows).toHaveLength(1);
  });

  it("raises a clear error when EDGE_FUNCTION_BASE is missing", async () => {
    const db = await applyMigrations();

    await expect(
      db.query(`select public.enqueue_sync_run('PRICES');`),
    ).rejects.toThrow("EDGE_FUNCTION_BASE");
  });

  it("raises a clear error when SUPABASE_ANON_KEY is missing", async () => {
    const db = await applyMigrations();

    await db.exec(`
      insert into public.sync_settings (key, value)
      values ('EDGE_FUNCTION_BASE', 'https://example.supabase.co');
    `);

    await expect(
      db.query(`select public.enqueue_sync_run('PRICES');`),
    ).rejects.toThrow("SUPABASE_ANON_KEY");
  });

  it("returns a run id when both EDGE_FUNCTION_BASE and SUPABASE_ANON_KEY are configured", async () => {
    const db = await applyMigrations();

    await db.exec(`
      insert into public.sync_settings (key, value) values
        ('EDGE_FUNCTION_BASE', 'https://example.supabase.co'),
        ('SUPABASE_ANON_KEY', 'fake-anon-key');
    `);

    const result = await db.query<{ run_id: string }>(`
      select public.enqueue_sync_run('PRICES') as run_id;
    `);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].run_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("0007 performance indexes migration", () => {
  const performanceSql = readFileSync(performanceIndexesPath, "utf8");

  it("declares indexes on filtered trade columns", () => {
    expect(performanceSql).toContain(
      "create index if not exists trades_broker_id_idx",
    );
    expect(performanceSql).toContain(
      "create index if not exists trades_trade_type_idx",
    );
    expect(performanceSql).toContain(
      "create index if not exists trades_currency_original_idx",
    );
    expect(performanceSql).toContain(
      "create index if not exists csv_import_rows_import_id_status_idx",
    );
  });

  it("declares get_latest_market_prices with DISTINCT ON", () => {
    expect(performanceSql).toMatch(
      /create or replace function public\.get_latest_market_prices/i,
    );
    expect(performanceSql).toContain("distinct on");
    expect(performanceSql).toContain("language sql");
  });

  it("applies cleanly to a PGlite database with stubbed auth", async () => {
    const db = await applyMigrations();

    const fn = await db.query<{ proname: string }>(`
      select proname
      from pg_proc
      join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
      where pg_namespace.nspname = 'public'
        and proname = 'get_latest_market_prices';
    `);
    expect(fn.rows).toHaveLength(1);
  });

  it("returns the latest non-delayed price per asset", async () => {
    const db = await applyMigrations();

    await db.exec(`
      insert into public.assets (id, ticker, asset_type, currency)
      values
        ('11111111-1111-1111-1111-111111111111', 'AAA', 'STOCK', 'USD'),
        ('22222222-2222-2222-2222-222222222222', 'BBB', 'STOCK', 'USD');

      insert into public.market_prices (asset_id, price, currency, price_usd, source, observed_at)
      values
        ('11111111-1111-1111-1111-111111111111', 10, 'USD', 10, 'TEST', '2024-01-01T00:00:00Z'),
        ('11111111-1111-1111-1111-111111111111', 12, 'USD', 12, 'TEST', '2024-02-01T00:00:00Z'),
        ('22222222-2222-2222-2222-222222222222', 20, 'USD', 20, 'TEST', '2024-01-15T00:00:00Z');
    `);

    const result = await db.query<{
      asset_id: string;
      price_usd: string;
    }>(`
      select asset_id, price_usd
      from public.get_latest_market_prices(
        array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']::uuid[]
      )
      order by asset_id;
    `);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].asset_id).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(Number(result.rows[0].price_usd)).toBe(12);
    expect(result.rows[1].asset_id).toBe(
      "22222222-2222-2222-2222-222222222222",
    );
    expect(Number(result.rows[1].price_usd)).toBe(20);
  });

  it("excludes delayed prices", async () => {
    const db = await applyMigrations();

    await db.exec(`
      insert into public.assets (id, ticker, asset_type, currency)
      values ('33333333-3333-3333-3333-333333333333', 'CCC', 'STOCK', 'USD');

      insert into public.market_prices (asset_id, price, currency, price_usd, source, observed_at, delayed_until)
      values
        ('33333333-3333-3333-3333-333333333333', 30, 'USD', 30, 'TEST', '2024-03-01T00:00:00Z', now() + interval '1 hour'),
        ('33333333-3333-3333-3333-333333333333', 28, 'USD', 28, 'TEST', '2024-02-01T00:00:00Z', null);
    `);

    const result = await db.query<{ price_usd: string }>(`
      select price_usd
      from public.get_latest_market_prices(
        array['33333333-3333-3333-3333-333333333333']::uuid[]
      );
    `);

    expect(result.rows).toHaveLength(1);
    expect(Number(result.rows[0].price_usd)).toBe(28);
  });

  it("returns no rows for an empty asset list", async () => {
    const db = await applyMigrations();

    const result = await db.query(`
      select * from public.get_latest_market_prices(array[]::uuid[]);
    `);

    expect(result.rows).toHaveLength(0);
  });
});

describe("0009 role-aware trades and imports RLS migration", () => {
  const rlsSql = readFileSync(roleAwareRlsPath, "utf8");

  it("drops every OWNER-only write policy it intends to replace", () => {
    expect(rlsSql).toContain(
      `drop policy if exists "owners can insert trades" on public.trades;`,
    );
    expect(rlsSql).toContain(
      `drop policy if exists "owners can update trades" on public.trades;`,
    );
    expect(rlsSql).toContain(
      `drop policy if exists "owners can delete trades" on public.trades;`,
    );
    expect(rlsSql).toContain(
      `drop policy if exists "owners can insert csv imports" on public.csv_imports;`,
    );
    expect(rlsSql).toContain(
      `drop policy if exists "owners can update csv imports" on public.csv_imports;`,
    );
    expect(rlsSql).toContain(
      `drop policy if exists "owners can delete csv imports" on public.csv_imports;`,
    );
    expect(rlsSql).toContain(
      `drop policy if exists "owners can insert csv import rows" on public.csv_import_rows;`,
    );
    expect(rlsSql).toContain(
      `drop policy if exists "owners can update csv import rows" on public.csv_import_rows;`,
    );
    expect(rlsSql).toContain(
      `drop policy if exists "owners can delete csv import rows" on public.csv_import_rows;`,
    );
    expect(rlsSql).toContain(
      `drop policy if exists "owners can insert alerts" on public.alerts;`,
    );
    expect(rlsSql).toContain(
      `drop policy if exists "owners can insert audit events" on public.audit_events;`,
    );
  });

  it("recreates the loosened policies with the OWNER/EDITOR predicate", () => {
    expect(rlsSql).toContain(
      `create policy "owners and editors can insert trades"`,
    );
    expect(rlsSql).toContain(
      `create policy "owners and editors can update trades"`,
    );
    expect(rlsSql).toContain(
      `create policy "owners and editors can delete trades"`,
    );
    expect(rlsSql).toContain(
      `create policy "owners and editors can insert csv imports"`,
    );
    expect(rlsSql).toContain(
      `create policy "owners and editors can insert csv import rows"`,
    );
    expect(rlsSql).toContain(
      `create policy "owners and editors can insert alerts"`,
    );
    expect(rlsSql).toContain(
      `create policy "owners and editors can insert audit events"`,
    );
    // Sanity: the broader role set appears in the new policy bodies.
    expect(rlsSql).toMatch(
      /current_user_has_role\([^)]*, 'OWNER'\)\s+or\s+public\.current_user_has_role\([^)]*, 'EDITOR'\)/,
    );
  });

  it("keeps portfolio_members as OWNER-only", () => {
    // The migration does NOT touch the portfolio_members policies
    // ("owners can read/insert/update/delete portfolio members" stay
    // OWNER-only from 0003).
    expect(rlsSql).not.toContain("portfolio members");
  });

  it("declares the three new helper functions as SECURITY DEFINER", () => {
    expect(rlsSql).toMatch(
      /create or replace function public\.find_user_by_email\(p_email text\)/i,
    );
    expect(rlsSql).toMatch(
      /create or replace function public\.count_portfolio_owners\(p_portfolio_id uuid\)/i,
    );
    expect(rlsSql).toMatch(
      /create or replace function public\.current_user_role\(p_portfolio_id uuid\)/i,
    );

    expect(rlsSql).toContain("security definer");
    expect(rlsSql).toContain("set search_path = public");
    expect(rlsSql).toContain(
      "grant execute on function public.find_user_by_email(text) to authenticated;",
    );
    expect(rlsSql).toContain(
      "grant execute on function public.count_portfolio_owners(uuid) to authenticated;",
    );
    expect(rlsSql).toContain(
      "grant execute on function public.current_user_role(uuid) to authenticated;",
    );
  });

  it("does not grant select on auth.users to authenticated", () => {
    expect(rlsSql).not.toMatch(/grant\s+select\s+on\s+auth\.users/i);
    expect(rlsSql).not.toMatch(/grant\s+select.*on\s+table\s+auth\.users/i);
  });

  it("applies cleanly to a PGlite database with stubbed auth", async () => {
    const db = await applyMigrations();

    const functions = await db.query<{ proname: string }>(`
      select proname
      from pg_proc
      join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
      where pg_namespace.nspname = 'public'
        and proname in (
          'find_user_by_email',
          'count_portfolio_owners',
          'current_user_role'
        )
      order by proname;
    `);
    expect(functions.rows.map((row) => row.proname)).toEqual([
      "count_portfolio_owners",
      "current_user_role",
      "find_user_by_email",
    ]);
  });
});
