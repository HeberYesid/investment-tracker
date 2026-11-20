import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { portfolio, getFreshness, getClient } = vi.hoisted(() => ({
  portfolio: vi.fn(), getFreshness: vi.fn(), getClient: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({ getPortfolioContext: portfolio }));
vi.mock("@/lib/supabase/server", () => ({ createUserSupabaseClient: getClient }));
vi.mock("@/lib/market-data/freshness", () => ({
  getMarketDataFreshness: getFreshness,
  evaluateFreshness: () => ({ shouldBackgroundSync: false }),
}));
vi.mock("@/components/layout/main-navigation", () => ({ MainNavigation: () => null }));
vi.mock("@/features/dashboard/dashboard-data-loader", () => ({ DashboardDataLoader: () => null }));
vi.mock("@/features/dashboard/stale-price-sync-trigger", () => ({ StalePriceSyncTrigger: () => null }));
vi.mock("@/features/dashboard/sync-now-button", () => ({ SyncNowButton: () => null }));

import Home from "@/app/page";

beforeEach(() => { vi.resetAllMocks(); });

describe("frescura de mercado en la home", () => {
  it("la demo pública no invoca la lectura de frescura autenticada", async () => {
    portfolio.mockResolvedValue({ kind: "anonymous" });
    expect(renderToStaticMarkup(await Home())).toContain("<main");
    expect(getClient).not.toHaveBeenCalled();
    expect(getFreshness).not.toHaveBeenCalled();
  });

  it("la home autenticada consulta la frescura mediante el cliente de usuario", async () => {
    const userClient = { rpc: vi.fn() };
    portfolio.mockResolvedValue({ kind: "active", portfolio: { role: "VIEWER" }, supabase: userClient });
    getFreshness.mockResolvedValue({ lastSyncFinishedAt: "2025-01-16T00:00:00Z" });
    expect(renderToStaticMarkup(await Home())).toContain("<main");
    expect(getFreshness.mock.calls).toEqual([[userClient]]);
  });

  it.each(["no-membership", "error"])("muestra un estado propio sin cargar datos cuando el contexto es %s", async (kind) => {
    portfolio.mockResolvedValue({ kind });
    expect(renderToStaticMarkup(await Home())).toContain(kind === "error" ? "No se pudo cargar tu portafolio" : "No tienes un portafolio activo");
    expect(getFreshness).not.toHaveBeenCalled();
  });
});
