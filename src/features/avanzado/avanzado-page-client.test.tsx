import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/dynamic", () => ({
  default: (_importFn: unknown, opts?: { ssr?: boolean; loading?: React.ComponentType }) => {
    if (opts?.loading) return opts.loading;
    return () => null;
  },
}));

const reloadMock = vi.fn();

function mockAdvanced(overrides: Partial<{
  loading: boolean;
  error: string | null;
  summary: unknown;
  distribution: unknown;
  evolution: unknown;
  returns: unknown;
  snapshot: unknown;
}> = {}) {
  vi.doMock("./use-advanced-data", () => ({
    useAdvancedData: () => ({
      loading: overrides.loading ?? false,
      error: overrides.error ?? null,
      payload: {
        summary: overrides.summary ?? null,
        distribution: overrides.distribution ?? null,
        evolution: overrides.evolution ?? null,
        returns: overrides.returns ?? null,
        snapshot: overrides.snapshot ?? null,
      },
      reload: reloadMock,
    }),
  }));
}

const emptyPayload = {
  summary: null,
  distribution: null,
  evolution: null,
  returns: null,
  snapshot: null,
};

const readySummary = { ledgerStatus: "complete" as const, ledgerIssues: [], hasActiveTrades: true,
  equityUsd: "1000",
  investedUsd: "800",
  realizedPnlUsd: "0",
  unrealizedPnlUsd: "200",
  totalPnlUsd: "200",
  returnPct: 25,
  twr: null,
  holdingsCount: 3,
  isEstimated: false,
  isAnyStale: false,
  staleTickers: [] as string[],
};

describe("AvanzadoPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("renders the reloading banner while refreshing", async () => {
    mockAdvanced({ loading: true, summary: readySummary });
    const { AvanzadoPageClient: Component } = await import("./avanzado-page-client");
    render(createElement(Component, { initialPayload: { ...emptyPayload, summary: readySummary } }));
    expect(screen.getByTestId("avanzado-reloading")).toBeInTheDocument();
  });

  it("renders the error state with a retry button", async () => {
    mockAdvanced({ error: "Algo falló" });
    const { AvanzadoPageClient: Component } = await import("./avanzado-page-client");
    render(createElement(Component, { initialPayload: emptyPayload }));
    expect(screen.getByTestId("avanzado-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("renders the empty state when the portfolio has no holdings", async () => {
    mockAdvanced({ summary: { ...readySummary, holdingsCount: 0, hasActiveTrades: false } });
    const { AvanzadoPageClient: Component } = await import("./avanzado-page-client");
    render(createElement(Component, { initialPayload: { ...emptyPayload, summary: { ...readySummary, holdingsCount: 0, hasActiveTrades: false } } }));
    expect(screen.getByTestId("avanzado-empty")).toBeInTheDocument();
  });

  it("renders summary, benchmark, distribution, and returns when payload is ready", async () => {
    mockAdvanced({
      summary: readySummary,
      evolution: {
        points: [
          { date: "2024-01-01", valueUsd: 1000 },
          { date: "2024-02-01", valueUsd: 1100 },
        ],
      },
      distribution: { dim: "broker", slices: [], unclassified: false },
      returns: { groupBy: "stock", ledgerStatus: "complete", ledgerIssues: [], rows: [] },
      snapshot: {
        benchmark: {
          benchmark: "S&P 500",
          points: [
            { date: "2024-01-01", value: 100 },
            { date: "2024-02-01", value: 105 },
          ],
          isStale: false,
        },
        assets: [],
        isAnyEstimated: false,
        isAnyStale: false,
      },
    });
    const { AvanzadoPageClient: Component } = await import("./avanzado-page-client");
    render(createElement(Component, { initialPayload: { ...emptyPayload, summary: readySummary } }));

    await waitFor(() => {
      expect(screen.getByTestId("avanzado-ready")).toBeInTheDocument();
    });
    expect(screen.getByTestId("summary-cards")).toBeInTheDocument();
    expect(screen.getByTestId("benchmark-chart-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("distribution-chart-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("returns-table")).toBeInTheDocument();
  });

  it("hides benchmark when snapshot has no benchmark series", async () => {
    mockAdvanced({
      summary: readySummary,
      distribution: { dim: "broker", slices: [], unclassified: false },
      returns: { groupBy: "stock", ledgerStatus: "complete", ledgerIssues: [], rows: [] },
      snapshot: { benchmark: null, assets: [], isAnyEstimated: false, isAnyStale: false },
    });
    const { AvanzadoPageClient: Component } = await import("./avanzado-page-client");
    render(createElement(Component, { initialPayload: { ...emptyPayload, summary: readySummary } }));

    await waitFor(() => {
      expect(screen.getByTestId("avanzado-ready")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("benchmark-chart-skeleton")).not.toBeInTheDocument();
  });

  it("shows the benchmark backfill prompt when there is no benchmark series", async () => {
    mockAdvanced({
      summary: readySummary,
      distribution: { dim: "broker", slices: [], unclassified: false },
      returns: { groupBy: "stock", ledgerStatus: "complete", ledgerIssues: [], rows: [] },
      snapshot: { benchmark: null, assets: [], isAnyEstimated: false, isAnyStale: false },
    });
    const { AvanzadoPageClient: Component } = await import("./avanzado-page-client");
    render(createElement(Component, { initialPayload: { ...emptyPayload, summary: readySummary } }));

    await waitFor(() => {
      expect(screen.getByTestId("benchmark-backfill-prompt")).toBeInTheDocument();
    });
    expect(screen.getByTestId("benchmark-backfill-button")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cargar historial/i })).toBeInTheDocument();
  });
});
