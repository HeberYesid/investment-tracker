import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const foundationPath = path.join(migrationsDir, "0001_foundation.sql");
const authPath = path.join(migrationsDir, "0003_auth_and_permissions.sql");
const roleAwareRlsPath = path.join(
  migrationsDir,
  "0009_role_aware_trades_imports_rls.sql",
);

let db: PGlite;
let authedUserId: string;
let portfolioId: string;
let editorUserId: string;
let viewerUserId: string;
let brokerId: string;
let assetId: string;

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
      id uuid primary key,
      email text
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
  await db.exec(readFileSync(roleAwareRlsPath, "utf8"));

  authedUserId = "11111111-1111-1111-1111-111111111111";
  await setAuthUid(authedUserId);
  await db.exec(
    `insert into auth.users (id) values ('${authedUserId}');`,
  );

  const portfolios = await db.query<{ id: string }>(`
    select id from public.portfolios where user_id = '${authedUserId}' limit 1;
  `);
  portfolioId = portfolios.rows[0].id;

  editorUserId = "44444444-4444-4444-4444-444444444444";
  viewerUserId = "55555555-5555-5555-5555-555555555555";
  brokerId = "66666666-6666-6666-6666-666666666666";
  assetId = "77777777-7777-7777-7777-777777777777";

  // Seed the editor and viewer into the existing portfolio, plus an asset
  // so the write-policy tests have something to insert into. The
  // portfolio_members.user_id FK requires the user to exist in
  // auth.users, so insert them there first.
  await db.exec(`
    insert into auth.users (id, email) values
      ('${editorUserId}', 'editor@example.com'),
      ('${viewerUserId}', 'viewer@example.com');
  `);
  await db.exec(`
    insert into public.portfolio_members (portfolio_id, user_id, role)
    values
      ('${portfolioId}', '${editorUserId}', 'EDITOR'),
      ('${portfolioId}', '${viewerUserId}', 'VIEWER');
  `);

  // Reuse the ETORO broker that 0001 already seeds.
  const etoro = await db.query<{ id: string }>(`
    select id from public.brokers where code = 'ETORO' limit 1;
  `);
  brokerId = etoro.rows[0].id;

  await db.exec(`
    insert into public.assets (id, ticker, asset_type, currency)
    values ('${assetId}', 'AAPL', 'STOCK', 'USD');
  `);
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

describe("0009 helper functions", () => {
  it("current_user_role returns the caller's role in the portfolio", async () => {
    await setAuthUid(authedUserId);
    const result = await db.query<{ current_user_role: string | null }>(`
      select public.current_user_role('${portfolioId}'::uuid) as current_user_role;
    `);
    expect(result.rows[0].current_user_role).toBe("OWNER");
  });

  it("count_portfolio_owners returns 1 for the seeded portfolio", async () => {
    const result = await db.query<{ count_portfolio_owners: number }>(`
      select public.count_portfolio_owners('${portfolioId}'::uuid) as count_portfolio_owners;
    `);
    expect(result.rows[0].count_portfolio_owners).toBe(1);
  });

  it("find_user_by_email returns the auth.users id when one exists", async () => {
    await db.exec(
      `insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'lookup@example.com');`,
    );

    const result = await db.query<{ find_user_by_email: string | null }>(`
      select public.find_user_by_email('lookup@example.com') as find_user_by_email;
    `);
    expect(result.rows[0].find_user_by_email).toBe(
      "33333333-3333-3333-3333-333333333333",
    );
  });

  it("find_user_by_email is case-insensitive", async () => {
    const result = await db.query<{ find_user_by_email: string | null }>(`
      select public.find_user_by_email('LOOKUP@EXAMPLE.COM') as find_user_by_email;
    `);
    expect(result.rows[0].find_user_by_email).toBe(
      "33333333-3333-3333-3333-333333333333",
    );
  });

  it("find_user_by_email returns null when no match", async () => {
    const result = await db.query<{ find_user_by_email: string | null }>(`
      select public.find_user_by_email('nobody@example.com') as find_user_by_email;
    `);
    expect(result.rows[0].find_user_by_email).toBeNull();
  });
});

describe("0009 write policies accept OWNER and EDITOR", () => {
  it("EDITOR can insert a trade", async () => {
    await setAuthUid(editorUserId);
    await db.exec(`set role authenticated;`);
    try {
      const result = await db.query<{ id: string }>(`
        insert into public.trades (
          portfolio_id, broker_id, asset_id, trade_date, trade_type,
          quantity, price_original, currency_original, commission_original,
          fx_rate_to_usd, source,
          price_usd, commission_usd, total_invested_usd
        ) values (
          '${portfolioId}', '${brokerId}', '${assetId}', '2024-01-15', 'BUY',
          1, 100, 'USD', 0, 1, 'MANUAL',
          100, 0, 100
        ) returning id;
      `);
      expect(result.rows[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    } finally {
      await db.exec(`reset role;`);
    }
  });

  it("VIEWER cannot insert a trade", async () => {
    await setAuthUid(viewerUserId);
    await db.exec(`set role authenticated;`);
    try {
      await expect(
        db.query(`
          insert into public.trades (
            portfolio_id, broker_id, asset_id, trade_date, trade_type,
            quantity, price_original, currency_original, commission_original,
            fx_rate_to_usd, source,
            price_usd, commission_usd, total_invested_usd
          ) values (
            '${portfolioId}', '${brokerId}', '${assetId}', '2024-02-15', 'BUY',
            1, 100, 'USD', 0, 1, 'MANUAL',
            100, 0, 100
          );
        `),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await db.exec(`reset role;`);
    }
  });

  it("EDITOR can insert an audit_event for the portfolio", async () => {
    await setAuthUid(editorUserId);
    await db.exec(`set role authenticated;`);
    try {
      await db.query(`
        insert into public.audit_events (portfolio_id, entity_type, entity_id, action, after_json)
        values ('${portfolioId}', 'trade', gen_random_uuid(), 'CREATE', '{}'::jsonb);
      `);

      const result = await db.query<{ count: number }>(`
        select count(*)::int as count from public.audit_events where portfolio_id = '${portfolioId}';
      `);
      expect(Number(result.rows[0].count)).toBeGreaterThanOrEqual(1);
    } finally {
      await db.exec(`reset role;`);
    }
  });
});
