import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { serializeTradeDTO, UpdateTradeInput } from "@/lib/validations/trades";

const mockTrade = {
  id: "550e8400-e29b-41d4-a716-446655440003",
  portfolio_id: "550e8400-e29b-41d4-a716-446655440000",
  broker_id: "550e8400-e29b-41d4-a716-446655440001",
  asset_id: "550e8400-e29b-41d4-a716-446655440002",
  trade_date: "2024-01-15",
  trade_type: "BUY",
  quantity: 10,
  price_original: 100,
  currency_original: "USD",
  commission_original: 5,
  fx_rate_to_usd: 1,
  price_usd: 100,
  commission_usd: 5,
  total_invested_usd: 1005,
  source: "MANUAL",
  source_file_id: null,
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T10:00:00Z",
  deleted_at: null,
};

type MockBuilder = Record<string, Mock>;

type MockResult = Record<string, unknown>;
const queuedResults: (MockResult | ((builder: MockBuilder) => MockResult))[] = [];
const builders: MockBuilder[] = [];

function createBuilder(): MockBuilder {
  const builder: MockBuilder = {};
  const chainMethods = [
    "select", "insert", "update", "eq", "is", "in",
    "order", "range", "single", "maybeSingle", "limit", "gte", "lte",
  ];
  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.then = vi.fn((resolve: (v: unknown) => void) => {
    const result = queuedResults.shift();
    resolve(typeof result === "function" ? result(builder) : result);
  });
  builders.push(builder);
  return builder;
}

const mockSupabase = {
  from: vi.fn().mockImplementation(() => createBuilder()),
  rpc: vi.fn(),
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "user-id-1" } },
      error: null,
    }),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: () => Promise.resolve(mockSupabase),
  createServiceSupabaseClient: () => mockSupabase,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  resolvePortfolioContext: async () => ({ kind: "active", portfolio: {
      portfolioId: "550e8400-e29b-41d4-a716-446655440000",
      role: "OWNER",
      portfolio: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Mi portafolio",
        base_currency: "USD",
      },
    } }),
}));

import { GET, POST } from "@/app/api/v1/trades/route";
import { PATCH, DELETE } from "@/app/api/v1/trades/[id]/route";
import { POST as bulkDelete } from "@/app/api/v1/trades/bulk-delete/route";

const validTradeInput = {
  trade_date: "2024-01-15",
  trade_type: "BUY",
  broker_code: "ETORO",
  ticker: "AAPL",
  asset_reference: { kind: "existing", asset_id: mockTrade.asset_id },
  quantity: 10,
  price_original: 100,
  currency_original: "USD",
  commission_original: 5,
  fx_rate_to_usd: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.rpc.mockReset().mockResolvedValue({ data: [{ key: "manual", status: "resolved", asset_id: mockTrade.asset_id }], error: null });
  queuedResults.length = 0;
  builders.length = 0;
});

describe("POST /api/v1/trades", () => {
  describe("post_fee_valida_cantidad_antes_de_catalogo_y_escrituras", () => {
    it("guarda cero numérico y USD 2 para una comisión independiente", async () => {
      const stored = { ...mockTrade, trade_type: "FEE", quantity: 0,
        commission_usd: 2, total_invested_usd: 2 };
      queuedResults.push({ data: { id: mockTrade.broker_id }, error: null },
        { data: stored, error: null }, { data: null, error: null });
      const response = await POST(new NextRequest("http://localhost/api/v1/trades", {
        method: "POST",
        body: JSON.stringify({ ...validTradeInput, trade_type: "FEE", quantity: 0,
          price_original: "0", commission_original: "2" }),
      }));

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ quantity: 0, commission_usd: "2", total_invested_usd: "2" });
      expect(mockSupabase.rpc).toHaveBeenCalledWith("resolve_asset_references", expect.objectContaining({
        p_portfolio_id: mockTrade.portfolio_id,
      }));
      expect(builders[1].insert).toHaveBeenCalledWith(expect.objectContaining({
        portfolio_id: mockTrade.portfolio_id, asset_id: mockTrade.asset_id, trade_type: "FEE", quantity: 0,
        commission_original: 2, commission_usd: 2, total_invested_usd: 2,
      }));
    });

    it.each([
      ["FEE", 1], ["FEE", "0"], ["FEE", null], ["FEE", undefined], ["FEE", 1e-9],
      ["BUY", 0], ["SELL", 1e-9],
    ])("rechaza %s con cantidad %s antes de efectos", async (trade_type, quantity) => {
      const response = await POST(new NextRequest("http://localhost/api/v1/trades", {
        method: "POST",
        body: JSON.stringify({ ...validTradeInput, trade_type, quantity }),
      }));
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { details: expect.arrayContaining([
        expect.objectContaining({ path: ["quantity"] }),
      ]) } });
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(revalidateTag).not.toHaveBeenCalled();
    });
  });

  it("rechaza la cotización USD→COP usada como multiplicador COP→USD", async () => {
    const response = await POST(new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      body: JSON.stringify({ ...validTradeInput, currency_original: "COP", fx_rate_to_usd: 3800 }),
    }));

    expect(response.status).toBe(422);
    expect(mockSupabase.from).not.toHaveBeenCalledWith("trades");
  });

  it("persiste 380.000 COP como aproximadamente 100 USD usando la precisión de la tasa guardada", async () => {
    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const response = await POST(new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      body: JSON.stringify({ ...validTradeInput, currency_original: "COP", quantity: 1,
        price_original: "380000", commission_original: "0", fx_rate_to_usd: "0.0002631578947368421" }),
    }));

    expect(response.status).toBe(201);
    expect(builders[1].insert).toHaveBeenCalledWith(expect.objectContaining({
      portfolio_id: mockTrade.portfolio_id,
      fx_rate_to_usd: 0.00026316,
    }));
    expect(builders[1].insert.mock.calls[0][0].total_invested_usd).toBeCloseTo(100, 2);
  });

  it("returns 201 for a valid trade", async () => {
    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTradeInput),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual(serializeTradeDTO(mockTrade));
    expect(mockSupabase.rpc).toHaveBeenCalledWith("resolve_asset_references", {
      p_portfolio_id: mockTrade.portfolio_id, p_source: "MANUAL", p_import_id: null,
      p_items: [{ key: "manual", ticker: "AAPL", decision: validTradeInput.asset_reference }],
    });
    expect(mockSupabase.from).not.toHaveBeenCalledWith("assets");
  });

  it("registra la compra con un alta explícita sin consultar perfiles", async () => {
    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null }, { data: mockTrade, error: null }, { data: null, error: null });
    const asset_reference = { kind: "new", exchange: "BVC", currency: "COP", asset_type: "STOCK" };
    const response = await POST(new NextRequest("http://localhost/api/v1/trades", {
      method: "POST", body: JSON.stringify({ ...validTradeInput, asset_reference }),
    }));
    expect(response.status).toBe(201);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("resolve_asset_references", expect.objectContaining({
      p_items: [{ key: "manual", ticker: "AAPL", decision: asset_reference }],
    }));
    expect(mockSupabase.from).not.toHaveBeenCalledWith("assets");
  });

  it.each([["needs_disambiguation", 422], ["42501", 403], ["XX000", 500]] as const)("no escribe operaciones ante resolución %s", async (reason, status) => {
    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    mockSupabase.rpc.mockResolvedValue(reason === "needs_disambiguation"
      ? { data: [{ key: "manual", status: reason }], error: null }
      : { error: { code: reason, message: "detalle interno" } });
    const response = await POST(new NextRequest("http://localhost/api/v1/trades", { method: "POST", body: JSON.stringify(validTradeInput) }));
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("detalle interno");
    expect(mockSupabase.from.mock.calls).toEqual([["brokers"]]);
  });

  it("returns 422 for invalid data (missing required fields)", async () => {
    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trade_type: "BUY" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(422);
  });

  it("returns 422 for COP without a valid FX rate", async () => {
    const copInput = { ...validTradeInput, currency_original: "COP", fx_rate_to_usd: 1 };

    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(copInput),
    });

    const response = await POST(request);

    expect(response.status).toBe(422);
  });

  it("computes USD values correctly", async () => {
    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTradeInput),
    });

    await POST(request);

    const tradesBuilder = builders[1];
    const insertedPayload = tradesBuilder.insert.mock.calls[0][0];

    expect(insertedPayload.price_usd).toBe(100);
    expect(insertedPayload.commission_usd).toBe(5);
    expect(insertedPayload.total_invested_usd).toBe(1005);
  });

  it("creates an audit event after trade creation", async () => {
    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTradeInput),
    });

    await POST(request);

    expect(mockSupabase.from).toHaveBeenCalledWith("audit_events");
    const auditBuilder = builders[2];
    const auditPayload = auditBuilder.insert.mock.calls[0][0];

    expect(auditPayload.entity_type).toBe("trade");
    expect(auditPayload.entity_id).toBe(mockTrade.id);
    expect(auditPayload.action).toBe("CREATE");
    expect(auditPayload.after_json).toEqual(mockTrade);
  });
});

describe("GET /api/v1/trades", () => {
  it("acota el listado y el conteo al portafolio activo antes de paginar", async () => {
    queuedResults.push({ data: [mockTrade], count: 1, error: null });
    const response = await GET(new NextRequest("http://localhost/api/v1/trades?limit=1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [{ id: mockTrade.id }], meta: { total: 1 } });
    expect(builders[0].eq).toHaveBeenCalledWith("portfolio_id", mockTrade.portfolio_id);
    expect(builders[0].eq.mock.invocationCallOrder[0]).toBeLessThan(builders[0].range.mock.invocationCallOrder[0]);
  });
  it("returns a paginated list of trades with ticker and broker", async () => {
    queuedResults.push({
      data: [
        {
          ...mockTrade,
          assets: { ticker: "AAPL", name: "Apple Inc" },
          brokers: { name: "eToro", code: "ETORO" },
        },
      ],
      error: null,
      count: 1,
    });

    const request = new NextRequest("http://localhost/api/v1/trades?page=1&limit=20");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].ticker).toBe("AAPL");
    expect(body.data[0].asset_name).toBe("Apple Inc");
    expect(body.data[0].broker_name).toBe("eToro");
    expect(body.data[0].broker_code).toBe("ETORO");
    expect(body.data[0].assets).toBeUndefined();
    expect(body.data[0].brokers).toBeUndefined();
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it("returns an empty list when no trades exist", async () => {
    queuedResults.push({ data: [], error: null, count: 0 });

    const request = new NextRequest("http://localhost/api/v1/trades?page=1&limit=20");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });
});

it("el lote excluye IDs de otro portafolio y cuenta solo las filas escritas", async () => {
  const outsideId = "550e8400-e29b-41d4-a716-446655440009";
  queuedResults.push({ data: [mockTrade], error: null });
  queuedResults.push({ data: [{ id: mockTrade.id }], error: null });
  queuedResults.push({ data: null, error: null });
  const response = await bulkDelete(new NextRequest("http://localhost/api/v1/trades/bulk-delete", {
    method: "POST", body: JSON.stringify({ ids: [mockTrade.id, outsideId] }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ deleted: 1 });
  expect(builders[0].eq).toHaveBeenCalledWith("portfolio_id", mockTrade.portfolio_id);
  expect(builders[1].eq).toHaveBeenCalledWith("portfolio_id", mockTrade.portfolio_id);
  expect(builders[1].in).toHaveBeenCalledWith("id", [mockTrade.id]);
});

describe("PATCH /api/v1/trades/:id", () => {
  const tradeId = "550e8400-e29b-41d4-a716-446655440003";

  describe("patch_valida_el_par_efectivo_y_la_version_leida", () => {
    const buy = { ...mockTrade, quantity: 1 };
    const fee = { ...mockTrade, trade_type: "FEE", quantity: 0, commission_original: 2 };
    const legacy = { ...fee, quantity: 1 };
    const patch = (input: Record<string, unknown>) => PATCH(new NextRequest(
      `http://localhost/api/v1/trades/${tradeId}`, { method: "PATCH", body: JSON.stringify(input) },
    ), { params: Promise.resolve({ id: tradeId }) });

    it.each([
      { existing: buy, input: { trade_type: "FEE" } },
      { existing: fee, input: { trade_type: "BUY" } },
      { existing: buy, input: { quantity: 0 } },
      { existing: fee, input: { quantity: 1 } },
      { existing: legacy, input: { trade_date: "2025-01-20" } },
      { existing: buy, input: { quantity: 1e-9 } },
      ...["SELL", "DIVIDEND", "TRANSFER_IN", "TRANSFER_OUT"].flatMap((type) => [
        { existing: fee, input: { trade_type: type } },
        { existing: { ...buy, trade_type: type }, input: { quantity: 0 } },
      ]),
    ])("rechaza la combinación efectiva incompatible %#", async ({ existing, input }) => {
      queuedResults.push({ data: existing, error: null });
      const response = await patch(input);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { details: expect.arrayContaining([
        expect.objectContaining({ path: ["quantity"] }),
      ]) } });
      expect(mockSupabase.from.mock.calls).toEqual([["trades"]]);
      expect(builders[0].update).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(revalidateTag).not.toHaveBeenCalled();
    });

    it.each([
      { existing: fee, input: { trade_date: "2025-01-20" }, expected: { trade_type: "FEE", quantity: 0 } },
      { existing: { ...fee, quantity: "0.00000000" }, input: { commission_original: "3" },
        expected: { trade_type: "FEE", quantity: 0, total_invested_usd: 3 } },
      { existing: buy, input: { trade_type: "FEE", quantity: 0 },
        expected: { trade_type: "FEE", quantity: 0, total_invested_usd: 5 } },
      { existing: fee, input: { trade_type: "BUY", quantity: 0.25 },
        expected: { trade_type: "BUY", quantity: 0.25, total_invested_usd: 27 } },
      { existing: legacy, input: { quantity: 0 },
        expected: { trade_type: "FEE", quantity: 0, total_invested_usd: 2 } },
      { existing: buy, input: { trade_type: "SELL" }, expected: { trade_type: "SELL", quantity: 1 } },
    ])("guarda y audita el par válido %#", async ({ existing, input, expected }) => {
      let stored: MockResult | undefined;
      queuedResults.push({ data: existing, error: null }, (builder) => {
        stored = { ...existing, quantity: Number(existing.quantity), ...builder.update.mock.calls[0][0] };
        return { data: stored, error: null };
      }, { data: null, error: null });
      const response = await patch(input);
      expect(response.status).toBe(200);
      expect(stored).toMatchObject(expected);
      expect(builders[2].insert).toHaveBeenCalledWith(expect.objectContaining({
        action: "UPDATE", before_json: existing, after_json: stored,
      }));
    });

    it("no confunde un string recibido por PATCH con el valor numérico de base", async () => {
      const response = await patch({ quantity: "0" });
      expect(response.status).toBe(422);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it("devuelve 404 para una fila fuera del portafolio activo", async () => {
      queuedResults.push((builder) => {
        expect(builder.eq.mock.calls).toEqual([["id", tradeId], ["portfolio_id", mockTrade.portfolio_id]]);
        expect(builder.is).toHaveBeenCalledWith("deleted_at", null);
        return { data: null, error: null };
      });
      expect((await patch({ quantity: 1 })).status).toBe(404);
      expect(mockSupabase.from.mock.calls).toEqual([["trades"]]);
    });

    it.each([
      { trade_type: "SELL" }, { quantity: 2 }, { updated_at: "2024-01-20T10:00:00Z" },
    ])("devuelve 409 cuando otra edición cambia %o entre lectura y escritura", async (change) => {
      let row: MockResult = { ...buy };
      queuedResults.push(() => {
        const read = row;
        row = { ...row, ...change };
        return { data: read, error: null };
      }, (builder) => {
        const matches = builder.eq.mock.calls.every(([column, value]) => row[column] === value);
        if (matches) row = { ...row, ...builder.update.mock.calls[0][0] };
        return { data: matches ? row : null, error: null };
      });
      const response = await patch({ commission_original: "7" });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: "CONFLICT", message: expect.stringMatching(/recarga/i) } });
      expect(row).toEqual({ ...buy, ...change });
      expect(builders[1].is).toHaveBeenCalledWith("deleted_at", null);
      expect(mockSupabase.from.mock.calls).toEqual([["trades"], ["trades"]]);
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(revalidateTag).not.toHaveBeenCalled();
    });
  });

  it("no declara el portafolio como campo editable", () => {
    expect(UpdateTradeInput.shape).not.toHaveProperty("portfolio_id");
    const result = UpdateTradeInput.safeParse({ portfolio_id: mockTrade.portfolio_id, quantity: 20 });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: "unrecognized_keys", keys: ["portfolio_id"] }),
    ]);
  });

  it("rechaza el campo de solo lectura antes de consultar o escribir", async () => {
    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "PATCH",
      body: JSON.stringify({ portfolio_id: mockTrade.portfolio_id, quantity: 20 }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: tradeId }) });

    expect(response.status).toBe(422);
    expect(builders).toHaveLength(0);
  });

  it("rechaza cambiar solo la moneda a COP cuando la operación tiene tasa 1", async () => {
    queuedResults.push({ data: mockTrade, error: null });
    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "PATCH",
      body: JSON.stringify({ currency_original: "COP" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: tradeId }) });

    expect(response.status).toBe(422);
    expect(builders).toHaveLength(1);
  });

  it("restablece la tasa a 1 y recalcula el total al cambiar solo la moneda a USD", async () => {
    queuedResults.push({ data: { ...mockTrade, currency_original: "COP", fx_rate_to_usd: 0.00025 }, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });
    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "PATCH",
      body: JSON.stringify({ currency_original: "USD" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: tradeId }) });

    expect(response.status).toBe(200);
    expect(builders[1].update).toHaveBeenCalledWith(expect.objectContaining({
      fx_rate_to_usd: 1, price_usd: 100, commission_usd: 5, total_invested_usd: 1005,
    }));
  });

  it("returns 200 for a valid partial update", async () => {
    const updatedTrade = { ...mockTrade, quantity: 20, updated_at: expect.any(String) };
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: updatedTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 20 }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: tradeId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quantity).toBe(20);
    expect(body.portfolio_id).toBe(mockTrade.portfolio_id);
    expect(builders[1].update.mock.calls[0][0]).not.toHaveProperty("portfolio_id");
    expect(builders[1].eq).toHaveBeenCalledWith("portfolio_id", mockTrade.portfolio_id);
    expect(builders[2].insert).toHaveBeenCalledWith(expect.objectContaining({
      portfolio_id: mockTrade.portfolio_id, action: "UPDATE",
    }));
  });

  it("returns 404 for a non-existent trade", async () => {
    queuedResults.push({ data: null, error: { message: "Not found" } });

    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 20 }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: tradeId }) });

    expect(response.status).toBe(404);
  });

  it("recomputes USD values when price_original changes", async () => {
    const updatedTrade = {
      ...mockTrade,
      price_original: 200,
      price_usd: 200,
      commission_usd: 5,
      total_invested_usd: 2005,
    };
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: updatedTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price_original: 200 }),
    });

    await PATCH(request, { params: Promise.resolve({ id: tradeId }) });

    const updateBuilder = builders[1];
    const updatePayload = updateBuilder.update.mock.calls[0][0];

    expect(updatePayload.price_usd).toBe(200);
    expect(updatePayload.commission_usd).toBe(5);
    expect(updatePayload.total_invested_usd).toBe(2005);
  });
});

describe("DELETE /api/v1/trades/:id", () => {
  const tradeId = "550e8400-e29b-41d4-a716-446655440003";

  it("returns 204 and sets deleted_at", async () => {
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: { id: mockTrade.id }, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: tradeId }) });

    expect(response.status).toBe(204);

    const deleteBuilder = builders[1];
    const updatePayload = deleteBuilder.update.mock.calls[0][0];
    expect(updatePayload.deleted_at).toBeDefined();
    expect(deleteBuilder.eq).toHaveBeenCalledWith("portfolio_id", mockTrade.portfolio_id);
  });

  it("returns 404 for a non-existent trade", async () => {
    queuedResults.push({ data: null, error: { message: "Not found" } });

    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: tradeId }) });

    expect(response.status).toBe(404);
  });

  it("creates an audit event after deletion", async () => {
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: { id: mockTrade.id }, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "DELETE",
    });

    await DELETE(request, { params: Promise.resolve({ id: tradeId }) });

    expect(mockSupabase.from).toHaveBeenCalledWith("audit_events");
    const auditBuilder = builders[2];
    const auditPayload = auditBuilder.insert.mock.calls[0][0];

    expect(auditPayload.entity_type).toBe("trade");
    expect(auditPayload.entity_id).toBe(mockTrade.id);
    expect(auditPayload.action).toBe("DELETE");
    expect(auditPayload.before_json).toEqual(mockTrade);
  });
});
