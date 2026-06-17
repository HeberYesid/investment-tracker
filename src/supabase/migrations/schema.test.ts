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
      id uuid primary key
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
