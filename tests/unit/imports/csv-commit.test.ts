import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ParsedCsvTrade } from "@/lib/csv/types";

const requireApiUserWithPortfolioMock = vi.fn();
const getCurrentPortfolioMock = vi.fn();
const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();

vi.mock("@/lib/api/auth", () => ({
  requireApiUserWithPortfolio: (
    supabase?: SupabaseClient,
    options?: { writeAccess?: boolean },
  ) => requireApiUserWithPortfolioMock(supabase, options),
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentPortfolio: () => getCurrentPortfolioMock(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

vi.mock("@/lib/market-data/yahoo", () => ({
  createYahooProvider: () => ({
    fetchProfileWithCandidates: vi.fn(async () => ({
      status: "ok",
      profile: { ticker: "AAPL", sector: "Technology", country: "US" },
    })),
  }),
}));

vi.mock("@/lib/market-data/symbols", () => ({
  candidateYahooSymbols: () => ["AAPL"],
}));

import { POST } from "@/app/api/v1/imports/csv/commit/route";

const IMPORT_ID = "11111111-1111-4111-8111-111111111111";
const PORTFOLIO_ID = "22222222-2222-4222-8222-222222222222";
const BROKER_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "44444444-4444-4444-8444-444444444444";

function buildTrade(ticker: string, _i: number): ParsedCsvTrade {
  return {
    trade_date: "2025-02-10",
    trade_type: "BUY",
    ticker,
    quantity: 1,
    price_original: 100,
    currency_original: "USD",
    commission_original: 0,
    fx_rate_to_usd: 1,
  };
}

interface CallRecord {
  method: string;
  args: unknown[];
  table: string;
}

interface SupabaseMockOptions {
  importRecord: Record<string, unknown> | null;
  validRows: Array<Record<string, unknown>>;
  existingAssets: Array<{ id: string; ticker: string }>;
}

function buildSupabaseMock(opts: SupabaseMockOptions) {
  const calls: CallRecord[] = [];
  const insertCalls: Array<{ table: string; payload: unknown[] }> = [];

  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = ["select", "eq", "is", "in", "gte", "lte", "order", "update"];
    for (const m of methods) {
      chain[m] = vi.fn((...args: unknown[]) => {
        calls.push({ method: m, args, table });
        return chain;
      });
    }
    chain.single = vi.fn(() => {
      calls.push({ method: "single", args: [], table });
      if (table === "csv_imports") {
        return Promise.resolve({ data: opts.importRecord, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    chain.insert = vi.fn((payload: unknown) => {
      calls.push({ method: "insert", args: [payload], table });
      insertCalls.push({ table, payload: Array.isArray(payload) ? payload : [payload] });
      if (table === "assets") {
        return Promise.resolve({
          data: (payload as Array<{ ticker: string }>).map((p) => ({
            id: ASSET_ID,
            ticker: p.ticker,
          })),
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    Object.defineProperty(chain, "then", {
      value: (resolve: (value: unknown) => unknown) => {
        if (table === "csv_import_rows") {
          return resolve({ data: opts.validRows, error: null });
        }
        if (table === "assets" && calls.some((c) => c.method === "in")) {
          return resolve({ data: opts.existingAssets, error: null });
        }
        return resolve({ data: [], error: null });
      },
    });
    return chain;
  };

  return { from, calls, insertCalls };
}

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/imports/csv/commit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const PORTFOLIO = {
  portfolioId: PORTFOLIO_ID,
  role: "OWNER" as const,
  portfolio: { id: PORTFOLIO_ID, name: "Mi portafolio", base_currency: "USD" as const },
};

describe("POST /api/v1/imports/csv/commit", () => {
  let supabaseMock: ReturnType<typeof buildSupabaseMock>;
  let supabase: SupabaseClient;

  beforeEach(() => {
    requireApiUserWithPortfolioMock.mockReset();
    getCurrentPortfolioMock.mockReset();
    revalidatePathMock.mockReset();
    revalidateTagMock.mockReset();
    supabaseMock = buildSupabaseMock({
      importRecord: { id: IMPORT_ID, broker_id: BROKER_ID, status: "PREVIEWED" },
      validRows: [],
      existingAssets: [{ id: ASSET_ID, ticker: "AAPL" }],
    });
    supabase = { from: supabaseMock.from } as unknown as SupabaseClient;
    requireApiUserWithPortfolioMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase,
      portfolio: PORTFOLIO,
      response: null,
    });
    getCurrentPortfolioMock.mockResolvedValue(PORTFOLIO);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("splits large imports into batches of 500 when inserting trades", async () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({
      row_number: i + 1,
      validation_status: "VALID",
      parsed_data_json: buildTrade("AAPL", i),
    }));
    supabaseMock = buildSupabaseMock({
      importRecord: { id: IMPORT_ID, broker_id: BROKER_ID, status: "PREVIEWED" },
      validRows: rows,
      existingAssets: [{ id: ASSET_ID, ticker: "AAPL" }],
    });
    supabase = { from: supabaseMock.from } as unknown as SupabaseClient;
    requireApiUserWithPortfolioMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase,
      portfolio: PORTFOLIO,
      response: null,
    });

    const response = await POST(buildRequest({ import_id: IMPORT_ID }));

    expect(response.status).toBe(200);
    const tradeInserts = supabaseMock.insertCalls.filter((c) => c.table === "trades");
    expect(tradeInserts).toHaveLength(2);
    expect(tradeInserts[0].payload).toHaveLength(500);
    expect(tradeInserts[1].payload).toHaveLength(100);
    const body = await response.json();
    expect(body.imported).toBe(600);
    expect(body.status).toBe("COMMITTED");
  });

  it("uses a single batch when trades fit under the 500 limit", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      row_number: i + 1,
      validation_status: "VALID",
      parsed_data_json: buildTrade("AAPL", i),
    }));
    supabaseMock = buildSupabaseMock({
      importRecord: { id: IMPORT_ID, broker_id: BROKER_ID, status: "PREVIEWED" },
      validRows: rows,
      existingAssets: [{ id: ASSET_ID, ticker: "AAPL" }],
    });
    supabase = { from: supabaseMock.from } as unknown as SupabaseClient;
    requireApiUserWithPortfolioMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase,
      portfolio: PORTFOLIO,
      response: null,
    });

    const response = await POST(buildRequest({ import_id: IMPORT_ID }));
    expect(response.status).toBe(200);
    const tradeInserts = supabaseMock.insertCalls.filter((c) => c.table === "trades");
    expect(tradeInserts).toHaveLength(1);
    expect(tradeInserts[0].payload).toHaveLength(50);
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
    expect(revalidatePathMock).toHaveBeenCalledWith("/avanzado");
    expect(revalidateTagMock).toHaveBeenCalledWith("market-prices");
  });

  it("returns 422 when import_id is not a valid uuid", async () => {
    const response = await POST(buildRequest({ import_id: "not-a-uuid" }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/validaci/i);
    expect(supabaseMock.insertCalls.find((c) => c.table === "trades")).toBeUndefined();
  });

  it("returns 403 when the user has view-only access", async () => {
    requireApiUserWithPortfolioMock.mockResolvedValue({
      user: null,
      supabase: null,
      portfolio: null,
      response: new Response(
        JSON.stringify({
          error: {
            code: "FORBIDDEN",
            message: "Tu rol es de solo lectura — no puedes crear ni editar operaciones.",
          },
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    });

    const response = await POST(buildRequest({ import_id: IMPORT_ID }));
    expect(response.status).toBe(403);
    expect(supabaseMock.insertCalls.find((c) => c.table === "trades")).toBeUndefined();
  });

  it("returns 409 when the import has already been committed", async () => {
    supabaseMock = buildSupabaseMock({
      importRecord: { id: IMPORT_ID, broker_id: BROKER_ID, status: "COMMITTED" },
      validRows: [],
      existingAssets: [],
    });
    supabase = { from: supabaseMock.from } as unknown as SupabaseClient;
    requireApiUserWithPortfolioMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase,
      portfolio: PORTFOLIO,
      response: null,
    });

    const response = await POST(buildRequest({ import_id: IMPORT_ID }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/ya fue confirmada/);
  });
});
