import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/features/avanzado/use-advanced-data", () => ({
  useAdvancedData: (initial: unknown) => ({
    loading: false,
    error: null,
    payload: initial,
    reload: vi.fn(),
  }),
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

import { AvanzadoPageClient } from "@/features/avanzado/avanzado-page-client";

const emptyPayload = {
  summary: null,
  distribution: null,
  evolution: null,
  returns: null,
  snapshot: null,
};

const readySummary = {
  equityUsd: 1000,
  investedUsd: 800,
  realizedPnlUsd: 0,
  unrealizedPnlUsd: 200,
  totalPnlUsd: 200,
  returnPct: 25,
  holdingsCount: 0,
  isEstimated: false,
  isAnyStale: false,
  staleTickers: [] as string[],
};

describe("avanzado dashboard client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the empty state when the portfolio has no holdings", async () => {
    render(
      createElement(AvanzadoPageClient, {
        initialPayload: { ...emptyPayload, summary: readySummary },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("avanzado-empty")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Tu portafolio está vacío" }),
    ).toBeInTheDocument();
  });

  it("renders the ready state with summary cards when holdings exist", async () => {
    render(
      createElement(AvanzadoPageClient, {
        initialPayload: {
          ...emptyPayload,
          summary: { ...readySummary, holdingsCount: 3 },
          distribution: { dim: "broker", slices: [], unclassified: false, totalUsd: 0 },
          returns: { groupBy: "month", rows: [] },
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("avanzado-ready")).toBeInTheDocument();
    });
    expect(screen.getByTestId("summary-cards")).toBeInTheDocument();
  });
});
