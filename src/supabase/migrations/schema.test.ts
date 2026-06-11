import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "0001_foundation.sql",
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

describe("foundation migration", () => {
  const migrationSql = readFileSync(migrationPath, "utf8").toLowerCase();
  const originalMigrationSql = readFileSync(migrationPath, "utf8");

  it("enables row level security on every public table", () => {
    for (const tableName of publicTables) {
      expect(migrationSql).toContain(
        `alter table public.${tableName} enable row level security;`,
      );
    }
  });

  it("seeds the supported brokers", () => {
    expect(migrationSql).toContain("etoro");
    expect(migrationSql).toContain("xtb");
    expect(migrationSql).toContain("trii");
    expect(migrationSql).toContain("etrading_bancolombia");
  });

  it("declares the Supabase UUID extension", () => {
    expect(migrationSql).toContain(
      "create extension if not exists pgcrypto with schema extensions;",
    );
  });

  it("applies the schema DDL and creates the expected public schema", async () => {
    const db = new PGlite();
    const pgliteCompatibleMigrationSql = originalMigrationSql.replace(
      "create extension if not exists pgcrypto with schema extensions;",
      "",
    );

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
    await db.exec(pgliteCompatibleMigrationSql);

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
