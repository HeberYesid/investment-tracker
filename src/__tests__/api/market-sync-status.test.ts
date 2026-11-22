import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), trades: vi.fn(), holdings: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireApiUserWithPortfolio: mocks.auth }));
vi.mock("@/lib/dashboard/loader", () => ({ loadTradesAndAssets: mocks.trades }));
vi.mock("@/lib/calculations/holdings", () => ({ aggregateHoldings: mocks.holdings }));
vi.mock("@/lib/dashboard/sync-status", () => ({ loadSyncHealth: mocks.sync }));

import { GET } from "@/app/api/v1/market-data/sync-status/route";

const request = new Request("http://localhost/api/v1/market-data/sync-status?portfolio_id=otro");
const supabase = {};
const sync = { lastSuccessAt: null, lastAttemptAt: null, nextRunEstimate: null, failedAssetCount: 0, lastFailureReason: "NONE" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.trades.mockResolvedValue({ trades: [], assets: [], brokers: [] });
  mocks.holdings.mockReturnValue([{ assetId: "propio", quantity: 2 }, { assetId: "cerrado", quantity: 0 }]);
  mocks.sync.mockResolvedValue(sync);
});

it("rechaza una petición anónima sin leer portafolios ni corridas", async () => {
  mocks.auth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
  expect((await GET(request)).status).toBe(401);
  expect(mocks.trades).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
});

it("usa únicamente posiciones abiertas del portafolio resuelto por el servidor", async () => {
  mocks.auth.mockResolvedValue({ response: null, portfolio: { portfolioId: "autorizado" }, supabase, user: { id: "lector" } });
  const response = await GET(request);
  expect(mocks.trades).toHaveBeenCalledExactlyOnceWith("autorizado", supabase);
  expect(mocks.sync).toHaveBeenCalledExactlyOnceWith(["propio"]);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual(sync);
});

it("rechaza la petición 61 sin repetir la consulta del portafolio", async () => {
  mocks.auth.mockResolvedValue({ response: null, portfolio: { portfolioId: "autorizado" }, supabase, user: { id: "limitado" } });
  for (let i = 0; i < 60; i++) expect((await GET(request)).status).toBe(200);
  expect((await GET(request)).status).toBe(429);
  expect(mocks.trades).toHaveBeenCalledTimes(60);
});
