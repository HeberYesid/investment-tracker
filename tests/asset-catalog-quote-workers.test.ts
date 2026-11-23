// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

const clients = vi.hoisted(() => ({ getServiceClient: vi.fn() }));
vi.mock("../supabase/functions/_shared/supabase", () => clients);

const serve = vi.fn<(handler: (request: Request) => Promise<Response>) => void>();
const env = vi.fn<(name: string) => string | undefined>();

const runId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

const workers = ["PRICES", "PRICES_HISTORY"] as const;
const fetchMock = vi.fn<typeof fetch>();
type Handler = (request: Request) => Promise<Response>;
let handlers: Handler[];

beforeAll(async () => {
  vi.stubGlobal("Deno", { env: { get: env }, serve });
  vi.stubGlobal("fetch", fetchMock);
  await vi.importActual("../supabase/functions/sync-prices/index");
  await vi.importActual("../supabase/functions/sync-asset-prices-history/index");
  handlers = serve.mock.calls.map(([handler]) => handler);
});

beforeEach(() => {
  env.mockReset();
  clients.getServiceClient.mockReset();
  fetchMock.mockReset().mockRejectedValue(new Error("Red no prevista por la fixture"));
});

afterAll(() => vi.unstubAllGlobals());

type FixtureResult = { data?: unknown; count?: number; error: { message: string } | null };

function workerFixture(kind: typeof workers[number], failWork = false, tradeAssets?: unknown[], cachedPrices: Array<Record<string, unknown>> = []) {
  const runs: Array<Record<string, unknown>> = [
    { id: runId, kind, status: "PENDING" },
  ];
  const inserts: Array<{ table: string; values: unknown }> = [];
  const activeAsset = { asset_id: "asset-a", assets: { yahoo_symbol: "SYNTH", ticker: "SYNTH" } };
  const benchmark = { id: "benchmark", ticker: "^GSPC", yahoo_symbol: "^GSPC" };

  const client = { from: (table: string) => {
    let values: Record<string, unknown> = {};
    let inserting = false;
    let head = false;
    const filters: Record<string, unknown> = {};
    const execute = (): FixtureResult => {
      switch (table) {
        case "market_sync_runs": {
          const row = runs.find((r) => Object.entries(filters).every(([key, value]) => r[key] === value));
          if (row) Object.assign(row, values);
          return { data: row ? { id: row.id } : null, error: null };
        }
        case "trades": return failWork
          ? { error: { message: "detalle privado de la cartera" } }
          : { data: tradeAssets ?? [activeAsset], error: null };
        case "assets": return { data: benchmark, error: null };
        case "market_prices":
          if (head) return { count: 0, error: null };
          if (!inserting) {
            if (Object.keys(values).length > 0) throw new Error("La fixture solo admite inserciones de cotizaciones");
            return { data: cachedPrices.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value)), error: null };
          }
          cachedPrices.push(...(Array.isArray(values) ? values : [values]));
          break;
        case "fx_rates":
          if (!inserting) return { data: { rate: 0.00025 }, error: null };
          break;
        default: throw new Error(`Tabla no prevista por la fixture: ${table}`);
      }
      inserts.push({ table, values });
      return { error: null };
    };
    const chain = {
      update: (data: typeof values) => { values = data; return chain; },
      insert: (data: typeof values) => { values = data; inserting = true; return chain; },
      eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
      select: (_fields: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return chain; },
      is: () => chain, gte: () => chain, order: () => chain, limit: () => chain, or: () => chain,
      maybeSingle: async () => execute(),
      then: (resolve: (result: FixtureResult) => void) => resolve(execute()),
    };
    return chain;
  } };
  clients.getServiceClient.mockReturnValue(client);
  return { runs, inserts, cachedPrices };
}

describe("símbolos del catálogo en los workers de precios", () => {
  it.each(["PRICES", "PRICES_HISTORY"] as const)("%s no consulta ni persiste precios de altas sin símbolo verificado", async (kind) => {
    const legacy = { asset_id: "referencia-previa", assets: { ticker: "ALFA", yahoo_symbol: null, requires_verified_quote_symbol: false } };
    const pending = { asset_id: "alta-pendiente", assets: { ...legacy.assets, requires_verified_quote_symbol: true } };
    const linked = { asset_id: "alta-verificada", assets: { ...pending.assets, yahoo_symbol: "ALFA.CO" } };
    const { runs, inserts } = workerFixture(kind, false, [legacy, pending, linked]);
    fetchMock.mockImplementation(async () => Response.json({ chart: { result: [{
      meta: { regularMarketPrice: 200, currency: "USD" }, timestamp: [1736942400],
      indicators: { adjclose: [{ adjclose: [80] }] },
    }] } }));

    const response = await handlers[workers.indexOf(kind)](new Request("http://localhost/fixture", { method: "POST", body: JSON.stringify({ runId }) }));
    expect(response.status).toBe(200);
    const symbols = fetchMock.mock.calls.map(([url]) => decodeURIComponent(new URL(String(url)).pathname.split("/").at(-1) ?? ""));
    expect(symbols).toEqual(kind === "PRICES" ? ["ALFA", "ALFA.CO", "^GSPC", "^GSPC"] : ["ALFA.CO"]);
    const assetIds = inserts.flatMap(({ values }) => Array.isArray(values) ? values : [values]).map((value) => value.asset_id);
    expect(assetIds).toEqual(kind === "PRICES" ? [legacy.asset_id, linked.asset_id, "benchmark", "benchmark"] : [linked.asset_id]);
    expect(runs[0].status).toBe("SUCCESS");
  });
});

describe("sincronización de cotizaciones solo con Yahoo", () => {
  const holdings = [
    { asset_id: "apple", assets: { ticker: "AAPL", yahoo_symbol: "AAPL", currency: "USD", asset_type: "STOCK", exchange: "NASDAQ" } },
    { asset_id: "microsoft", assets: { ticker: "MSFT", yahoo_symbol: "MSFT", currency: "USD", asset_type: "STOCK", exchange: "NASDAQ" } },
  ];
  const yahooQuote = () => Response.json({ chart: { result: [{
    meta: { regularMarketPrice: 200, currency: "USD" }, timestamp: [1736942400],
    indicators: { adjclose: [{ adjclose: [80] }] },
  }] } });

  it.each([
    { failure: "HTTP 429", code: "RATE_LIMITED", message: "Yahoo: 429 for AAPL" },
    { failure: "error de red", code: "TRANSIENT", message: "Yahoo: request failed for AAPL" },
  ])("conserva la cotización anterior sin otro proveedor si Yahoo falla ($failure)", async ({ failure, code, message }) => {
    const previous = { asset_id: "apple", price_usd: 191, source: "YAHOO", observed_at: "2026-06-16T20:00:00Z" };
    const { cachedPrices, runs } = workerFixture("PRICES", false, holdings, [{ ...previous }]);
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/AAPL")) {
        if (failure === "error de red") throw new Error("Fallo simulado de red");
        return new Response(null, { status: 429 });
      }
      return yahooQuote();
    });

    const response = await handlers[0](new Request("http://localhost/fixture", { method: "POST", body: JSON.stringify({ runId }) }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ errors: [{ symbol: "AAPL", message }] });
    expect(new Set(fetchMock.mock.calls.map(([url]) => new URL(String(url)).hostname))).toEqual(new Set(["query1.finance.yahoo.com"]));
    expect(cachedPrices.filter((row) => row.asset_id === "apple")).toEqual([previous]);
    expect(runs[0]).toMatchObject({ status: "SUCCESS", failed_assets: { apple: code } });
    expect(cachedPrices).toContainEqual(expect.objectContaining({ asset_id: "microsoft", source: "YAHOO" }));
  });
});
