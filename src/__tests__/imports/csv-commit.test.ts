import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ParsedCsvTrade } from "@/lib/csv/types";

const requireApiUserWithPortfolioMock = vi.fn();
const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();

vi.mock("@/lib/api/auth", () => ({
  requireApiUserWithPortfolio: (
    supabase?: SupabaseClient,
    options?: { writeAccess?: boolean },
  ) => requireApiUserWithPortfolioMock(supabase, options),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

import { POST } from "@/app/api/v1/imports/csv/commit/route";
import type { ReferenceItem } from "@/lib/asset-catalog/resolve-references";

const IMPORT_ID = "11111111-1111-4111-8111-111111111111";
const PORTFOLIO_ID = "22222222-2222-4222-8222-222222222222";
const BROKER_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "44444444-4444-4444-8444-444444444444";
const ALT_ASSET_ID = "55555555-5555-4555-8555-555555555555";
const rowId = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const choices = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [rowId(i), { kind: "existing", asset_id: ASSET_ID }]));

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
  finalizedCount?: number;
  failTradeBatch?: number;
}

function buildSupabaseMock(opts: SupabaseMockOptions) {
  const calls: CallRecord[] = [];
  const insertCalls: Array<{ table: string; payload: unknown[] }> = [];
  let tradeBatches = 0;
  const rpc = vi.fn(async (_name: string, { p_items }: { p_items: ReferenceItem[] }) => ({
    error: null as { code: string; message?: string } | null,
    data: p_items.map(({ key, decision }) => ({ key, status: "resolved", asset_id: decision?.kind === "existing" ? decision.asset_id : ALT_ASSET_ID })),
  }));

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
      if (table === "trades" && ++tradeBatches === opts.failTradeBatch) return Promise.resolve({ error: { message: "lote rechazado" } });
      return Promise.resolve({ data: null, error: null });
    });
    Object.defineProperty(chain, "then", {
      value: (resolve: (value: unknown) => unknown) => {
        if (table === "csv_import_rows") {
          return resolve({ data: opts.validRows, error: null });
        }
        if (table === "csv_imports") {
          return resolve({ data: null, error: null, count: opts.finalizedCount ?? 1 });
        }
        return resolve({ data: [], error: null });
      },
    });
    return chain;
  };

  return { from, calls, insertCalls, rpc };
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
    revalidatePathMock.mockReset();
    revalidateTagMock.mockReset();
    supabaseMock = buildSupabaseMock({
      importRecord: { id: IMPORT_ID, broker_id: BROKER_ID, status: "PREVIEWED" },
      validRows: [],
    });
    supabase = supabaseMock as unknown as SupabaseClient;
    requireApiUserWithPortfolioMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase,
      portfolio: PORTFOLIO,
      response: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("splits large imports into batches of 500 when inserting trades", async () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({
      id: rowId(i),
      row_number: i + 1,
      validation_status: "VALID",
      parsed_data_json: buildTrade("AAPL", i),
    }));
    supabaseMock = buildSupabaseMock({
      importRecord: { id: IMPORT_ID, broker_id: BROKER_ID, status: "PREVIEWED" },
      validRows: rows,
    });
    supabase = supabaseMock as unknown as SupabaseClient;
    requireApiUserWithPortfolioMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase,
      portfolio: PORTFOLIO,
      response: null,
    });

    const response = await POST(buildRequest({ import_id: IMPORT_ID, asset_references: choices(600) }));

    expect(response.status).toBe(200);
    const tradeInserts = supabaseMock.insertCalls.filter((c) => c.table === "trades");
    expect(tradeInserts).toHaveLength(2);
    expect(tradeInserts[0].payload).toHaveLength(500);
    expect(tradeInserts[1].payload).toHaveLength(100);
    const body = await response.json();
    expect(body.imported).toBe(600);
    expect(body.status).toBe("COMMITTED");
    expect(supabaseMock.rpc.mock.calls.map(([, args]) => args.p_items[0].row_ids?.length)).toEqual([500, 100]);
    expect(supabaseMock.calls.some(({ table }) => table === "assets")).toBe(false);
  });

  it("no informa éxito ni audita una confirmación cuando la actualización no encontró el padre activo", async () => {
    const db = buildSupabaseMock({
      importRecord: { id: IMPORT_ID, broker_id: BROKER_ID, status: "PREVIEWED" },
      validRows: [{ id: rowId(0), row_number: 1, parsed_data_json: buildTrade("AAPL", 0) }],
      finalizedCount: 0,
    });
    requireApiUserWithPortfolioMock.mockResolvedValue({
      user: { id: "u1" }, supabase: db, portfolio: PORTFOLIO, response: null,
    });

    const response = await POST(buildRequest({ import_id: IMPORT_ID, asset_references: choices(1) }));

    expect(response.status).toBe(500);
    expect(db.calls.filter(({ table, method }) => table === "csv_imports" && method === "eq")
      .map(({ args }) => args)).toEqual([
      ["id", IMPORT_ID], ["portfolio_id", PORTFOLIO_ID],
      ["id", IMPORT_ID], ["portfolio_id", PORTFOLIO_ID],
    ]);
    expect(db.insertCalls.some(({ table }) => table === "audit_events")).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("uses a single batch when trades fit under the 500 limit", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      id: rowId(i),
      row_number: i + 1,
      validation_status: "VALID",
      parsed_data_json: buildTrade("AAPL", i),
    }));
    supabaseMock = buildSupabaseMock({
      importRecord: { id: IMPORT_ID, broker_id: BROKER_ID, status: "PREVIEWED" },
      validRows: rows,
    });
    supabase = supabaseMock as unknown as SupabaseClient;
    requireApiUserWithPortfolioMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase,
      portfolio: PORTFOLIO,
      response: null,
    });

    const response = await POST(buildRequest({ import_id: IMPORT_ID, asset_references: choices(50) }));
    expect(response.status).toBe(200);
    const tradeInserts = supabaseMock.insertCalls.filter((c) => c.table === "trades");
    expect(tradeInserts).toHaveLength(1);
    expect(tradeInserts[0].payload).toHaveLength(50);
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
    expect(revalidatePathMock).toHaveBeenCalledWith("/avanzado");
    expect(revalidateTagMock).toHaveBeenCalledWith("market-prices", "max");
  });

  it("mantiene los UUID por mercado y omite solo las filas ambiguas", async () => {
    const db = buildSupabaseMock({
      importRecord: { id: IMPORT_ID, broker_id: BROKER_ID, status: "PREVIEWED" },
      validRows: Array.from({ length: 3 }, (_, i) => ({ id: rowId(i), row_number: i + 1, parsed_data_json: buildTrade("ALFA", i) })),
    });
    requireApiUserWithPortfolioMock.mockResolvedValue({ user: { id: "u1" }, supabase: db, portfolio: PORTFOLIO, response: null });
    const response = await POST(buildRequest({ import_id: IMPORT_ID, asset_references: {
      [rowId(0)]: { kind: "existing", asset_id: ASSET_ID },
      [rowId(1)]: { kind: "new", exchange: "BVC", currency: "COP", asset_type: "STOCK" },
    } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ import_id: IMPORT_ID, status: "COMMITTED", imported: 2, errors: [expect.stringMatching(/^Fila 3:/)] });
    expect(db.insertCalls.find(({ table }) => table === "trades")?.payload).toEqual([
      expect.objectContaining({ asset_id: ASSET_ID, portfolio_id: PORTFOLIO_ID }),
      expect.objectContaining({ asset_id: ALT_ASSET_ID, portfolio_id: PORTFOLIO_ID }),
    ]);
  });

  it.each([["42501", 403], ["XX000", 500]] as const)("no escribe trades si falla el resolver (%s)", async (code, status) => {
    const db = buildSupabaseMock({
      importRecord: { id: IMPORT_ID, broker_id: BROKER_ID, status: "PREVIEWED" },
      validRows: [{ id: rowId(0), row_number: 1, parsed_data_json: buildTrade("ALFA", 0) }],
    });
    db.rpc.mockResolvedValue({ data: [], error: { code, message: "detalle interno" } });
    requireApiUserWithPortfolioMock.mockResolvedValue({ user: { id: "u1" }, supabase: db, portfolio: PORTFOLIO, response: null });
    const response = await POST(buildRequest({ import_id: IMPORT_ID, asset_references: choices(1) }));
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("detalle interno");
    expect(db.insertCalls).toEqual([]);
  });

  it.each([0, 501])("conserva el resultado completado para %s decisiones", async (count) => {
    const db = buildSupabaseMock({
      importRecord: { id: IMPORT_ID, broker_id: BROKER_ID, status: "PREVIEWED" },
      validRows: Array.from({ length: count || 1 }, (_, i) => ({ id: rowId(i), row_number: i + 1, parsed_data_json: buildTrade("ALFA", i) })),
      failTradeBatch: 2,
    });
    requireApiUserWithPortfolioMock.mockResolvedValue({ user: { id: "u1" }, supabase: db, portfolio: PORTFOLIO, response: null });
    const response = await POST(buildRequest({ import_id: IMPORT_ID, asset_references: choices(count) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ import_id: IMPORT_ID, status: count ? "COMMITTED" : "FAILED",
      imported: count ? 500 : 0, errors: [expect.stringMatching(count ? /^Lotes 501-501:/ : /^Fila 1:/)] });
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
    });
    supabase = supabaseMock as unknown as SupabaseClient;
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
