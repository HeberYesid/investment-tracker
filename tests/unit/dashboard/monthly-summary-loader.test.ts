import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getMonthlyPriceWindow, prepareMonthlyPortfolioSummary, valueMonthlyPortfolioSummary } from "@/lib/calculations/monthly-portfolio-summary";
import type { LedgerTrade } from "@/lib/calculations/position-ledger";
import { countTradesThroughCutoff, loadDashboardData, loadMonthlyClosingPrices, loadTradesAndAssets } from "@/lib/dashboard/loader";

const { serviceFrom, serviceRpc } = vi.hoisted(() => ({ serviceFrom: vi.fn(), serviceRpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceSupabaseClient: () => ({ from: serviceFrom, rpc: serviceRpc }) }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

const assetA = "30000000-0000-4000-8000-000000000001";
const assetB = "30000000-0000-4000-8000-000000000002";
const broker = "40000000-0000-4000-8000-000000000001";
const period = { startDate: "2025-01-01", endDate: "2025-01-31", openingCutoffDate: "2024-12-31" };

interface PriceRow {
  id: string;
  asset_id: string;
  observed_at: string;
  price_usd: string;
  source: string;
  currency: string;
}

function quote(id: number, asset_id: string, observed_at: string, price_usd: string, extra: Partial<PriceRow> = {}): PriceRow {
  return { id: `60000000-0000-4000-8000-${String(id).padStart(12, "0")}`, asset_id, observed_at, price_usd, source: "PRICE_HISTORY", currency: "USD", ...extra };
}

function priceClient(rows: PriceRow[], cap = 1, afterPage?: () => void) {
  const queries: Array<ReturnType<typeof newQuery>> = [];
  function newQuery() {
    let matches = rows;
    const order: Array<keyof PriceRow> = [];
    const page = (from: number, size: number) => {
      const data = matches.toSorted((a, b) => {
        for (const field of order) {
          const comparison = b[field].localeCompare(a[field]);
          if (comparison) return comparison;
        }
        return 0;
      }).slice(from, from + Math.min(cap, size));
      afterPage?.();
      return { data, error: null };
    };
    const chain = {
      select: vi.fn(() => chain),
      in: vi.fn((field: keyof PriceRow, values: string[]) => { matches = matches.filter((row) => values.includes(row[field])); return chain; }),
      eq: vi.fn((field: keyof PriceRow, value: string) => { matches = matches.filter((row) => row[field] === value); return chain; }),
      gte: vi.fn((field: keyof PriceRow, value: string) => { matches = matches.filter((row) => row[field] >= value); return chain; }),
      lt: vi.fn((field: keyof PriceRow, value: string) => { matches = matches.filter((row) => row[field] < value); return chain; }),
      order: vi.fn((field: keyof PriceRow) => { order.push(field); return chain; }),
      or: vi.fn((filter: string) => {
        const match = /^observed_at\.lt\.([^,]+),and\(observed_at\.eq\.\1,id\.lt\.([\da-f-]+)\)$/.exec(filter);
        if (!match) throw new Error("Cursor inválido en la prueba");
        const [, date, id] = match;
        matches = matches.filter((row) => row.observed_at < date || (row.observed_at === date && row.id < id));
        return chain;
      }),
      limit: vi.fn(async (size: number) => page(0, size)),
    };
    return chain;
  }
  const from = vi.fn((table: string) => {
    expect(table).toBe("market_prices");
    const query = newQuery();
    queries.push(query);
    return query;
  });
  return { client: { from } as unknown as SupabaseClient, from, queries };
}

describe("lecturas del resumen mensual", () => {
  it("encuentra cierres recientes aun con histórico largo truncado", async () => {
    const buy = (id: number, asset_id: string, trade_date: string) => ({
      id: `50000000-0000-4000-8000-${String(id).padStart(12, "0")}`, asset_id, trade_date,
      broker_id: broker, trade_type: "BUY", quantity: "1", price_usd: "10", commission_usd: "0", deleted_at: null,
      assets: { ticker: `A${id}`, name: null, sector: null, country: null, currency: "USD" },
    }) satisfies LedgerTrade & { assets: unknown };
    const oldRows = Array.from({ length: 1_000 }, (_, id) => quote(id, assetA, new Date(Date.UTC(2020, 0, 1 + id)).toISOString(), "10"));
    const recent = [quote(1_001, assetA, "2024-12-31T12:00:00Z", "100.00000001"),
      quote(1_002, assetA, "2025-01-31T12:00:00Z", "110"), quote(1_003, assetB, "2025-01-31T12:00:00Z", "20")];
    const { client, from, queries } = priceClient([...oldRows, ...recent]);
    const oldOrder = vi.fn().mockResolvedValue({ data: oldRows, error: null });
    serviceFrom.mockReturnValue({ select: () => ({ in: () => ({ eq: () => ({ gte: () => ({ lte: () => ({ order: oldOrder }) }) }) }) }) });
    serviceRpc.mockReturnValue({ select: async () => ({ data: [], error: null }) });
    from.mockImplementationOnce(() => ({ select: () => ({ eq: () => ({ is: async () => ({
      data: [buy(1, assetA, "2020-01-01"), buy(2, assetB, "2025-01-15")], error: null,
    }) }) }) }) as unknown as ReturnType<typeof from>);

    const data = await loadDashboardData("active", client);
    expect(data.historicalPrices).toHaveLength(1_000);
    expect(data.historicalPrices.at(-1)?.observed_at).toBe("2022-09-26T00:00:00.000Z");
    expect(oldOrder).toHaveBeenCalledWith("observed_at", { ascending: true });
    const input = prepareMonthlyPortfolioSummary(data.ledgerTrades, data.assets, data.brokers, period, true)!;
    const load = (cutoff: typeof input.opening, date: string) => loadMonthlyClosingPrices(client, {
      assetIds: cutoff.positions?.map(({ assetId }) => assetId) ?? [], ...getMonthlyPriceWindow(date),
    });
    const opening = await load(input.opening, period.openingCutoffDate);
    const closing = await load(input.closing, period.endDate);
    expect(valueMonthlyPortfolioSummary(input, { opening, closing })).toMatchObject({ openingValueUsd: "100.00000001", closingValueUsd: "130" });
    for (const query of queries) {
      expect(query.select).toHaveBeenCalledWith("id, asset_id, observed_at, price_usd::text");
      expect(query.eq.mock.calls).toEqual([["source", "PRICE_HISTORY"], ["currency", "USD"]]);
      expect(query.order.mock.calls).toEqual([["observed_at", { ascending: false }], ["id", { ascending: false }]]);
    }
    expect(queries[0].in).toHaveBeenCalledWith("asset_id", [assetA]);
    expect(queries[0].gte).toHaveBeenCalledWith("observed_at", "2024-12-24T00:00:00.000Z");
    expect(queries[0].lt).toHaveBeenCalledWith("observed_at", "2025-01-01T00:00:00.000Z");
    const closingQueries = queries.filter((query) => query.in.mock.calls[0][1].includes(assetB));
    expect(closingQueries.length).toBeGreaterThan(1);
    expect(closingQueries[1].or).toHaveBeenCalledOnce();
    expect(closingQueries[0].in).toHaveBeenCalledWith("asset_id", [assetA, assetB]);
    expect(closingQueries[0].gte).toHaveBeenCalledWith("observed_at", "2025-01-24T00:00:00.000Z");
    expect(closingQueries[0].lt).toHaveBeenCalledWith("observed_at", "2025-02-01T00:00:00.000Z");
  });

  it("elige el precio válido más reciente", async () => {
    const missing = "missing";
    const options = { assetIds: [assetA, assetB, missing], ...getMonthlyPriceWindow(period.endDate) };
    const { client } = priceClient([
      quote(1, assetA, "2025-02-01T00:00:00Z", "999"),
      quote(2, assetA, "2025-01-31T23:59:59.999999Z", "NaN"),
      quote(3, assetA, "2025-01-31T23:00:00Z", "0"),
      quote(4, assetA, "2025-01-31T22:00:00Z", "11"),
      quote(5, assetA, "2025-01-31T22:00:00Z", "12"),
      quote(6, assetA, "2025-01-31T09:00:00Z", "13"),
      quote(7, assetB, "2025-01-29T12:00:00Z", "999", { currency: "COP" }),
      quote(8, assetB, "2025-01-29T12:00:00Z", "999", { source: "YAHOO" }),
      quote(9, assetB, "2025-01-24T00:00:00.000Z", "20.00000001"),
      quote(10, missing, "2025-01-23T23:59:59.999Z", "40"),
      quote(11, missing, "2025-02-01T00:00:00.000Z", "50"),
    ], 2);
    expect(await loadMonthlyClosingPrices(client, options)).toEqual(new Map([[assetA, "12"], [assetB, "20.00000001"]]));
  });

  it("avanza por fecha e ID aunque una cotización nueva se inserte antes del cursor", async () => {
    const date = "2025-01-31T23:59:59.999998+00:00";
    const rows = [quote(2, assetA, date, "100"), quote(1, assetB, date, "110")];
    const { client, queries } = priceClient(rows, 1, () => {
      if (rows.length === 2) rows.push(quote(3, assetA, "2025-01-31T23:59:59.999999+00:00", "120"));
    });
    const prices = await loadMonthlyClosingPrices(client, { assetIds: [assetA, assetB], ...getMonthlyPriceWindow(period.endDate) });
    expect(prices).toEqual(new Map([[assetA, "100"], [assetB, "110"]]));
    expect(queries).toHaveLength(2);
    expect(queries[1].or).toHaveBeenCalledWith(`observed_at.lt.${date},and(observed_at.eq.${date},id.lt.${rows[0].id})`);
  });

  it("rechaza un cursor no verificable sin interpolarlo en el filtro", async () => {
    const { client, queries } = priceClient([
      quote(1, assetA, "2025-01-31T12:00:00Z", "NaN", { id: "unexpected,cursor" }),
    ]);
    await expect(loadMonthlyClosingPrices(client, { assetIds: [assetA], ...getMonthlyPriceWindow(period.endDate) })).rejects.toThrow();
    expect(queries).toHaveLength(1);
    expect(queries[0].or).not.toHaveBeenCalled();
  });

  it("verifica la completitud sin inferirla del tamaño de página", async () => {
    const rows = Array.from({ length: 1_000 }, (_, id) => ({
      id: String(id), asset_id: assetA, broker_id: broker, trade_type: "BUY", trade_date: "2025-02-01",
      quantity: "1", price_usd: "10", commission_usd: "0", deleted_at: null,
    }));
    const result = vi.fn();
    const builder = {
      select: vi.fn(() => builder), eq: vi.fn(() => builder), is: vi.fn(() => builder), lte: vi.fn(() => builder),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    const from = vi.fn(() => builder);
    const client = { from } as unknown as SupabaseClient;
    for (const [count, complete] of [[1_000, true], [1_001, false], [null, false]] as const) {
      result.mockReturnValue({ data: rows, error: null, count });
      const loaded = await loadTradesAndAssets("active", client, true);
      expect(loaded.ledgerTrades).toHaveLength(1_000);
      expect(loaded.ledgerTradesComplete).toBe(complete);
    }
    expect(from.mock.calls).toHaveLength(3);
    expect(builder.select.mock.calls).toEqual(Array.from({ length: 3 }, () => [expect.any(String), { count: "exact" }]));
    expect(builder.eq.mock.calls).toEqual(Array.from({ length: 3 }, () => ["portfolio_id", "active"]));
    expect(builder.is.mock.calls).toEqual(Array.from({ length: 3 }, () => ["deleted_at", null]));
    expect(builder.lte).not.toHaveBeenCalled();

    for (const count of [0, 2, null]) {
      result.mockReturnValue({ data: null, error: null, count });
      expect(await countTradesThroughCutoff("active", client, period.endDate)).toBe(count);
    }
    result.mockReturnValue({ data: null, error: { message: "No se pudo contar" }, count: null });
    await expect(countTradesThroughCutoff("active", client, period.endDate)).rejects.toThrow("No se pudo contar");
    expect(builder.select).toHaveBeenLastCalledWith("id", { count: "exact", head: true });
    expect(builder.eq).toHaveBeenLastCalledWith("portfolio_id", "active");
    expect(builder.is).toHaveBeenLastCalledWith("deleted_at", null);
    expect(builder.lte).toHaveBeenLastCalledWith("trade_date", period.endDate);
  });
});
