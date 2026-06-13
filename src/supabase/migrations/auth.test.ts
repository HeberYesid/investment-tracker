import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const foundationPath = path.join(migrationsDir, "0001_foundation.sql");
const authPath = path.join(migrationsDir, "0003_auth_and_permissions.sql");

let db: PGlite;
let authedUserId: string;

async function setAuthUid(value: string | null) {
  if (value === null) {
    await db.exec("select set_config('request.jwt.claim.sub', '', false);");
  } else {
    await db.exec(
      `select set_config('request.jwt.claim.sub', '${value}', false);`,
    );
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create schema if not exists extensions;
    create role anon;
    create role authenticated;
    create table auth.users (
      id uuid primary key
    );
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
  `);

  const foundationSql = readFileSync(foundationPath, "utf8").replace(
    "create extension if not exists pgcrypto with schema extensions;",
    "",
  );
  await db.exec(foundationSql);
  await db.exec(readFileSync(authPath, "utf8"));

  authedUserId = "11111111-1111-1111-1111-111111111111";
  await setAuthUid(authedUserId);
  await db.exec(
    `insert into auth.users (id) values ('${authedUserId}');`,
  );
});

afterAll(async () => {
  await db.close();
});

describe("handle_new_user trigger", () => {
  it("creates a profile, default portfolio, and OWNER membership", async () => {
    const profiles = await db.query<{ id: string; locale: string }>(`
      select id, locale from public.profiles where id = '${authedUserId}';
    `);
    expect(profiles.rows).toHaveLength(1);
    expect(profiles.rows[0].locale).toBe("es");

    const portfolios = await db.query<{
      id: string;
      name: string;
      user_id: string;
    }>(`
      select id, name, user_id from public.portfolios where user_id = '${authedUserId}';
    `);
    expect(portfolios.rows).toHaveLength(1);
    expect(portfolios.rows[0].name).toBe("Mi portafolio");
    const portfolioId = portfolios.rows[0].id;

    const members = await db.query<{ role: string }>(`
      select role from public.portfolio_members
      where portfolio_id = '${portfolioId}' and user_id = '${authedUserId}';
    `);
    expect(members.rows).toHaveLength(1);
    expect(members.rows[0].role).toBe("OWNER");
  });

  it("uses ON CONFLICT DO NOTHING in the trigger body for safety", () => {
    const sql = readFileSync(authPath, "utf8").toLowerCase();
    const functionBody = sql.split("create or replace function public.handle_new_user")[1] ?? "";
    expect(functionBody).toContain("on conflict (id) do nothing");
    expect(functionBody).toContain("on conflict (portfolio_id, user_id) do nothing");
  });
});

describe("membership helper functions", () => {
  it("current_user_is_member is true for the OWNER", async () => {
    await setAuthUid(authedUserId);
    const portfolio = await db.query<{ id: string }>(`
      select id from public.portfolios where user_id = '${authedUserId}' limit 1;
    `);
    const portfolioId = portfolio.rows[0].id;
    const result = await db.query<{ current_user_is_member: boolean }>(`
      select public.current_user_is_member('${portfolioId}'::uuid) as current_user_is_member;
    `);
    expect(result.rows[0].current_user_is_member).toBe(true);
  });

  it("current_user_has_role returns true only for OWNER", async () => {
    await setAuthUid(authedUserId);
    const portfolio = await db.query<{ id: string }>(`
      select id from public.portfolios where user_id = '${authedUserId}' limit 1;
    `);
    const portfolioId = portfolio.rows[0].id;
    const owner = await db.query<{ current_user_has_role: boolean }>(`
      select public.current_user_has_role('${portfolioId}'::uuid, 'OWNER') as current_user_has_role;
    `);
    expect(owner.rows[0].current_user_has_role).toBe(true);

    const viewer = await db.query<{ current_user_has_role: boolean }>(`
      select public.current_user_has_role('${portfolioId}'::uuid, 'VIEWER') as current_user_has_role;
    `);
    expect(viewer.rows[0].current_user_has_role).toBe(false);
  });

  it("membership helpers return false for an unrelated user", async () => {
    const otherUserId = "22222222-2222-2222-2222-222222222222";
    await setAuthUid(otherUserId);
    const portfolio = await db.query<{ id: string }>(`
      select id from public.portfolios where user_id = '${authedUserId}' limit 1;
    `);
    const portfolioId = portfolio.rows[0].id;
    const isMember = await db.query<{ current_user_is_member: boolean }>(`
      select public.current_user_is_member('${portfolioId}'::uuid) as current_user_is_member;
    `);
    expect(isMember.rows[0].current_user_is_member).toBe(false);

    await setAuthUid(authedUserId);
  });
});
