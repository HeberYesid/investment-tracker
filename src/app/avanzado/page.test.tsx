import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/features/avanzado/use-advanced-data", () => ({
  useAdvancedData: () => ({
    loading: false,
    error: null,
    payload: {
      summary: {
        equityUsd: 0,
        investedUsd: 0,
        realizedPnlUsd: 0,
        unrealizedPnlUsd: 0,
        totalPnlUsd: 0,
        returnPct: 0,
        holdingsCount: 0,
        isEstimated: true,
      },
      evolution: null,
      snapshot: null,
    },
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentUser: () => Promise.resolve(null),
  requireUser: () => Promise.resolve(null),
  getCurrentPortfolio: () => Promise.resolve(null),
  requireCurrentPortfolio: () => Promise.resolve(null),
}));

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/avanzado",
}));

import AvanzadoPage from "./page";

describe("avanzado page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Spanish mobile-first advanced dashboard shell", async () => {
    render(createElement(AvanzadoPage));

    expect(
      screen.getByRole("heading", { name: "Análisis avanzado del portafolio" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Navegación principal" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Avanzado" })).toHaveAttribute(
      "href",
      "/avanzado",
    );
  });

  it("shows the empty state when the user has no trades", async () => {
    render(createElement(AvanzadoPage));

    await waitFor(() => {
      expect(screen.getByTestId("avanzado-empty")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Tu portafolio está vacío" }),
    ).toBeInTheDocument();
  });
});
