import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { XtbParser } from "@/lib/csv/parsers/xtb";
import { xtbCashOperations, type XtbRow } from "../../../tests/fixtures/files/xtb-cash-operations";
import { loadDashboardAggregate } from "@/lib/dashboard/aggregate";
import { buildDashboardValuation } from "@/lib/dashboard/current";
import { loadDashboardData } from "@/lib/dashboard/loader";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: () => Promise.resolve(mockSupabase),
  createServiceSupabaseClient: () => mockSupabase,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

const mockGetCurrentPortfolio = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/auth", () => ({
  resolvePortfolioContext: async () => {
    const portfolio = await mockGetCurrentPortfolio();
    return portfolio ? { kind: "active", portfolio } : { kind: "no-membership" };
  },
}));

import { POST as previewPost } from "@/app/api/v1/imports/csv/preview/route";
import { POST as commitPost } from "@/app/api/v1/imports/csv/commit/route";
import { POST as tradePost } from "@/app/api/v1/trades/route";

type MultipartField =
  | { name: string; value: string }
  | { name: string; fileName: string; content: string; contentType: string };

function buildMultipartRequest(
  url: string,
  fields: MultipartField[],
): NextRequest {
  const boundary = `----formdata-test-${Math.random().toString(36).slice(2)}`;
  const parts: Buffer[] = [];
  for (const field of fields) {
    if ("value" in field) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`,
          "utf-8",
        ),
      );
    } else {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"; filename="${field.fileName}"\r\nContent-Type: ${field.contentType}\r\n\r\n${field.content}\r\n`,
          "utf-8",
        ),
      );
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, "utf-8"));
  const body = Buffer.concat(parts);

  // Construct a NextRequest and override formData() to bypass the
  // undici multipart parser (which fails in some Node versions for
  // hand-crafted bodies that are not produced by the browser).
  const formData = new FormData();
  for (const field of fields) {
    if ("value" in field) {
      formData.append(field.name, field.value);
    } else {
      formData.append(
        field.name,
        new File([field.content], field.fileName, { type: field.contentType }),
      );
    }
  }
  const request = new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  request.formData = () => Promise.resolve(formData);
  return request;
}

beforeEach(() => {
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: "u1" } },
    error: null,
  });
  mockGetCurrentPortfolio.mockResolvedValue({
    portfolioId: "p1",
    role: "OWNER",
    portfolio: { id: "p1", name: "Test", base_currency: "USD" },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("cierre_con_fee_persistido_muestra_18_por_dos_entradas", () => {
  const sources = ["MANUAL", "CSV"] as const;

  async function projectAfterFee(source: (typeof sources)[number] | "LEGADO", scenario = "cierre") {
    const brokerId = "33333333-3333-4333-8333-333333333333";
    const assetId = "44444444-4444-4444-8444-444444444444";
    const importId = "11111111-1111-4111-8111-111111111111";
    const common = { asset_id: assetId, broker_id: brokerId, portfolio_id: "p1", deleted_at: null, commission_usd: 0,
      assets: { ticker: "ACME", name: "ACME", sector: null, country: null }, brokers: { code: "XTB", name: "XTB" } };
    const trades: Record<string, unknown>[] = [
      { ...common, id: "77777777-7777-4777-8777-777777777777", trade_type: "BUY", trade_date: "2025-01-16", quantity: 1, price_usd: 100, total_invested_usd: 100 },
      ...(scenario === "abierta" ? [] : [{ ...common, id: "88888888-8888-4888-8888-888888888888", trade_type: "SELL", trade_date: "2025-01-17", quantity: 1, price_usd: 120, total_invested_usd: 120 }]),
    ];
    const date = scenario === "empate" ? "2025-01-17" : "2025-01-18";
    let preview: Record<string, unknown>[] = [];
    let importRecord: Record<string, unknown> | undefined;
    mockSupabase.rpc.mockImplementation((name, args) => {
      const response = Promise.resolve({ error: null, data: name === "resolve_asset_references"
        ? args.p_items.map(({ key }: { key: string }) => ({ key, status: "resolved", asset_id: assetId })) : [] });
      return Object.assign(response, { select: () => response });
    });
    mockSupabase.from.mockImplementation((table: string) => {
      let result: unknown = { data: [], error: null };
      if (table === "trades") result = { data: trades, error: null };
      if (table === "brokers") result = { data: { id: brokerId }, error: null };
      if (table === "csv_imports") result = { data: importRecord, error: null };
      if (table === "csv_import_rows") result = { data: preview.filter((row) => row.validation_status === "VALID"), error: null };
      if (table === "assets") result = { data: null, error: null };
      const chain = {
        select: (projection?: string) => {
          if (table === "trades" && projection?.includes("quantity::text")) {
            result = { data: trades.map((row) => ({ ...row, quantity: String(row.quantity), price_usd: String(row.price_usd), commission_usd: String(row.commission_usd) })), error: null };
          }
          return chain;
        }, eq: () => chain, is: () => chain, or: () => chain,
        in: () => chain, limit: () => chain, gte: () => chain, lte: () => chain, order: () => chain,
        single: async () => result, maybeSingle: async () => result,
        insert: (data: Record<string, unknown> | Record<string, unknown>[]) => {
          if (table === "csv_imports") {
            importRecord = { ...data, id: importId };
            result = { data: importRecord, error: null };
          } else if (table === "csv_import_rows" && Array.isArray(data)) {
            preview = data;
          } else if (table === "trades") {
            const inserted = (Array.isArray(data) ? data : [data]).map((row) => ({ ...common, ...row,
              id: "66666666-6666-4666-8666-666666666666", created_at: "2025-01-18", updated_at: "2025-01-18" }));
            trades.push(...inserted);
            result = { data: inserted[0], error: null };
          }
          return chain;
        },
        update: (data: Record<string, unknown>) => {
          importRecord = { ...importRecord, ...data };
          result = { data: null, error: null, count: 1 };
          return chain;
        },
        then: (resolve: (response: unknown) => unknown) => resolve(result),
      };
      return chain;
    });
    const supabase = mockSupabase as unknown as SupabaseClient;
    const before = await loadDashboardAggregate("p1", supabase);
    expect.soft(before.summary).toMatchObject({ realizedPnlUsd: scenario === "abierta" ? "0" : "20", holdingsCount: scenario === "abierta" ? 1 : 0 });
    const decision = { kind: "existing", asset_id: assetId };
    if (source === "MANUAL") {
      const response = await tradePost(new NextRequest("http://localhost/api/v1/trades", { method: "POST", body: JSON.stringify({
        trade_type: "FEE", ticker: "ACME", broker_code: "XTB", trade_date: date, quantity: 0,
        price_original: "0", currency_original: "USD", commission_original: "2", fx_rate_to_usd: "1", asset_reference: decision,
      }) }));
      expect(response.status).toBe(201);
    } else if (source === "CSV") {
      const form = new FormData();
      form.set("file", new File([xtbCashOperations([["SEC fee", "ACME.US", date, -2]])], "xtb.xlsx"));
      form.set("broker_code", "XTB");
      const upload = new NextRequest("http://localhost/api/v1/imports/csv/preview", { method: "POST" });
      upload.formData = async () => form;
      const response = await previewPost(upload);
      expect(response.status).toBe(200);
      const body = await response.json();
      const confirmation = await commitPost(new NextRequest("http://localhost/api/v1/imports/csv/commit", { method: "POST", body: JSON.stringify({
        import_id: importId, asset_references: { [body.rows[0].id]: decision },
      }) }));
      expect(confirmation.status).toBe(200);
      expect(await confirmation.json()).toMatchObject({ status: "COMMITTED", imported: 1, errors: [] });
    } else {
      trades.push({ ...common, id: "66666666-6666-4666-8666-666666666666", quantity: 1, price_usd: 0, commission_usd: 2,
        total_invested_usd: 2, trade_type: "FEE", trade_date: date, source });
    }
    expect(trades).toHaveLength(scenario === "abierta" ? 2 : 3);
    const fee = { asset_id: assetId, broker_id: brokerId, quantity: source === "LEGADO" ? 1 : 0, commission_usd: 2, trade_type: "FEE", trade_date: date, source };
    expect(trades.at(-1)).toMatchObject(fee);
    const stock = await loadDashboardAggregate("p1", supabase);
    const broker = await loadDashboardAggregate("p1", supabase, "full", { returnsGroupBy: "broker" });
    const [position] = buildDashboardValuation(await loadDashboardData("p1", supabase)).positions;
    expect(trades.at(-1)).toMatchObject(fee);
    return { ...stock, broker: broker.returns, position };
  }

  it.each(sources)("la ruta %s proyecta USD 18 y la fila cerrada", async (source) => {
    const projected = await projectAfterFee(source);
    expect(projected.position.balance).toMatchObject({ quantity: 0n, cost: 0n });
    const amounts = { realizedPnlUsd: "18", investedUsd: "0", unrealizedPnlUsd: "0", totalPnlUsd: "18", ledgerStatus: "complete" };
    expect.soft(projected.summary).toMatchObject({ ...amounts, equityUsd: "0", holdingsCount: 0, hasActiveTrades: true, ledgerIssues: [] });
    expect.soft(projected.returns?.rows).toMatchObject([{ ...amounts, label: "ACME", actualUsd: "0" }]);
    expect.soft(projected.broker?.rows).toMatchObject([{ ...amounts, label: "XTB", actualUsd: "0" }]);
    expect.soft(projected.distribution).toMatchObject({ totalUsd: "0", ledgerStatus: "complete", slices: [] });
  });

  it("capitaliza el cargo al mantener abierta la posición", async () => {
    const { summary, returns, distribution, position } = await projectAfterFee("MANUAL", "abierta");
    expect(position.balance?.quantity).toBe(100_000_000n);
    expect(summary).toMatchObject({ investedUsd: "102", equityUsd: "102", realizedPnlUsd: "0", holdingsCount: 1 });
    expect(returns?.rows).toMatchObject([{ investedUsd: "102", actualUsd: "102", realizedPnlUsd: "0" }]);
    expect(distribution).toMatchObject({ totalUsd: "102", slices: [{ valueUsd: "102", percent: 100 }] });
  });

  it.each([
    ["LEGADO", "cierre", "INVALID_TRADE", "2025-01-18"],
    ["MANUAL", "empate", "AMBIGUOUS_DAY_ORDER", "2025-01-17"],
  ] as const)("no publica un total conciliado para %s/%s", async (source, scenario, code, tradeDate) => {
    const { summary, returns, broker, distribution, position } = await projectAfterFee(source, scenario);
    expect(position).toMatchObject({ balance: null, issue: { code, tradeDate } });
    const status = { ledgerStatus: "unavailable", ledgerIssues: [{ code, tradeDate }] };
    const amounts = { investedUsd: null, realizedPnlUsd: null, unrealizedPnlUsd: null, totalPnlUsd: null, returnPct: null };
    expect(summary).toMatchObject({ ...status, ...amounts, equityUsd: null, holdingsCount: null });
    for (const table of [returns, broker]) {
      expect(table).toMatchObject({ ...status, rows: [{ ...amounts, actualUsd: null, ledgerStatus: "unavailable" }] });
    }
    expect(distribution).toMatchObject({ ...status, totalUsd: null, slices: [] });
  });
});

describe("POST /api/v1/imports/csv/preview", () => {
  describe("xtb_no_oculta_cargos_reconocidos", () => {
    const date = "2025-01-18";
    const valid: XtbRow[] = [
      ["Withholding tax", "ACME.US", date, -2],
      ["SEC fee", "ACME.US", "19/01/2025", "-3.50"],
    ];
    const invalid: XtbRow[] = [
      ["SEC fee", "", date, -2],
      ["SEC fee", "UNKNOWN.US", date, -2],
      ...[2, "-2.00 USD", "-2.3.4", "", 0, -0.004].map((amount): XtbRow => ["SEC fee", "ACME.US", date, amount]),
      ["Withholding tax", "ACME.US", "2025-02-30", -2],
      ["Withholding tax", "ACME.US", "2025-01-18Tilegible", -2],
      ["Withholding tax", "ACME.US", "", -2],
    ];
    const fee = { trade_type: "FEE", quantity: 0, price_original: 0, currency_original: "USD", fx_rate_to_usd: 1, ticker: "ACME", source_symbol: "ACME.US" };

    it("conserva ambos débitos y los motivos estructurados en el orden del parser", () => {
      const rows = new XtbParser().parse("xtb.xlsx", xtbCashOperations([valid[0], ...invalid, valid[1]]));
      expect(rows[0]).toMatchObject({ ...fee, trade_date: date, commission_original: 2 });
      expect(rows.at(-1)).toMatchObject({ ...fee, trade_date: "2025-01-19", commission_original: 3.5 });
      expect(rows.slice(1, -1)).toMatchObject([
        ...Array.from({ length: 2 }, () => ({ issue: "XTB_FEE_SYMBOL" })),
        ...Array.from({ length: 6 }, () => ({ issue: "XTB_FEE_AMOUNT" })),
        ...Array.from({ length: 3 }, () => ({ issue: "XTB_FEE_DATE" })),
      ]);
    });

    it.each([true, false])("persiste incidencias sin candidata tanto con válidas (%s) como sin ellas", async (mixed) => {
      const workbook = xtbCashOperations(mixed ? [valid[0], ...invalid, valid[1]] : invalid);
      const form = new FormData();
      form.set("file", new File([workbook], "xtb.xlsx"));
      form.set("broker_code", "XTB");
      const request = new NextRequest("http://localhost/api/v1/imports/csv/preview", { method: "POST" });
      request.formData = async () => form;
      const insertImport = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "import" } }) }) });
      const insertRows = vi.fn().mockResolvedValue({ error: null });
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "brokers") return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: "broker" } }) }) }) };
        if (table === "csv_imports") return { insert: insertImport };
        if (table === "csv_import_rows") return { insert: insertRows };
        throw new Error(`Tabla inesperada: ${table}`);
      });
      const response = await previewPost(request);
      expect(response.status).toBe(200);
      const body = await response.json();
      const validCount = mixed ? 2 : 0;
      const total = invalid.length + validCount;
      expect(body.summary).toEqual({ total, valid: validCount, invalid: invalid.length });
      expect(insertImport).toHaveBeenCalledWith(expect.objectContaining({ total_rows: total, valid_rows: validCount, invalid_rows: invalid.length }));
      expect(body.rows.filter((row: { valid: boolean }) => row.valid)).toHaveLength(validCount);
      if (mixed) expect(body.rows[0]).toMatchObject({ valid: true, parsed: { ...fee, commission_original: 2 } });
      const invalidAmountRows = body.rows.slice(mixed ? 3 : 2, mixed ? 9 : 8);
      expect(invalidAmountRows).toHaveLength(6);
      for (const row of invalidAmountRows) {
        expect(row).toMatchObject({
          valid: false,
          parsed: null,
          error: "Revisa la columna Amount del cargo XTB: debe contener un número negativo (por ejemplo, -2.50), sin texto de moneda, que no se redondee a cero.",
        });
      }
      const byRow = insertRows.mock.calls[0][0];
      for (const [index, row] of body.rows.entries()) {
        expect(row.row_number).toBe(index + 1);
        expect(byRow[index]).toMatchObject({ id: row.id, row_number: row.row_number, validation_error: row.error, parsed_data_json: row.parsed });
        if (!row.valid) {
          expect(row.parsed).toBeNull();
          expect(row.error).toMatch(/símbolo|Amount|fecha/);
          expect(byRow[index]).toMatchObject({ validation_status: "INVALID", raw_data_json: expect.objectContaining({ Type: expect.any(String) }) });
        }
      }
      expect(mockSupabase.from.mock.calls).toEqual([["brokers"], ["csv_imports"], ["csv_import_rows"]]);
    });
  });

  it("returns 401 when no user is authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [
        { name: "broker_code", value: "ETORO" },
        { name: "file", fileName: "test.xlsx", content: "", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 when portfolio is not found", async () => {
    mockGetCurrentPortfolio.mockResolvedValueOnce(null);

    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [
        { name: "broker_code", value: "ETORO" },
        { name: "file", fileName: "test.xlsx", content: "", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("portafolio");
  });

  it("returns 400 when file is missing", async () => {
    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [{ name: "broker_code", value: "ETORO" }],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("archivo");
  });

  it("returns 400 when broker_code is missing", async () => {
    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [
        { name: "file", fileName: "test.xlsx", content: "dummy", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("broker_code");
  });

  it("returns 400 when broker is not supported", async () => {
    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [
        { name: "broker_code", value: "UNSUPPORTED" },
        { name: "file", fileName: "test.xlsx", content: "dummy", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("no soportado");
  });

  it("returns 400 when portfolio_id mismatches", async () => {
    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [
        { name: "broker_code", value: "ETORO" },
        { name: "file", fileName: "test.xlsx", content: "dummy", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        { name: "portfolio_id", value: "wrong-id" },
      ],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("no coincide");
  });

  it("returns 400 when portfolio_id is not a valid UUID", async () => {
    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [
        { name: "broker_code", value: "ETORO" },
        { name: "file", fileName: "test.xlsx", content: "dummy", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        { name: "portfolio_id", value: "550e8400-e29b-41d4-a716-446655440000" },
      ],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("no coincide");
  });
});

describe("POST /api/v1/imports/csv/commit", () => {
  it("returns 401 when no user is authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "123e4567-e89b-12d3-a456-426614174000" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 when portfolio is not found", async () => {
    mockGetCurrentPortfolio.mockResolvedValueOnce(null);

    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "123e4567-e89b-12d3-a456-426614174000" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("portafolio");
  });

  it("returns 422 when import_id is missing", async () => {
    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(422);
  });

  it("returns 422 when import_id is not a valid UUID", async () => {
    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "not-a-uuid" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(422);
  });

  it("returns 400 when import is not found", async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({ data: null, error: { message: "Not found" } }),
    });

    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "123e4567-e89b-12d3-a456-426614174000" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("no encontrada");
  });

  it("returns 409 when import is already committed", async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          status: "COMMITTED",
          broker_id: "b1",
        },
        error: null,
      }),
    });

    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "123e4567-e89b-12d3-a456-426614174000" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("ya fue confirmada");
  });

  it("returns 400 when import has failed status", async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          status: "FAILED",
          broker_id: "b1",
        },
        error: null,
      }),
    });

    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "123e4567-e89b-12d3-a456-426614174000" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("falló");
  });
});
