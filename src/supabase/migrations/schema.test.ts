import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");

const foundationPath = path.join(migrationsDir, "0001_foundation.sql");
const fixFxPath = path.join(migrationsDir, "0002_fix_fx_rate_cop.sql");
const authPath = path.join(migrationsDir, "0003_auth_and_permissions.sql");

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
    create role anon;
    create role authenticated;
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

  it("applies the schema DDL and creates the expected public schema", async () => {
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
