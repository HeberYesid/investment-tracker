import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/features/dashboard/use-dashboard-data", () => ({
  useDashboardData: () => ({
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
      distribution: null,
      evolution: null,
      returns: null,
      drawdown: null,
    },
    reload: vi.fn(),
  }),
}));

import Home from "./page";

describe("home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Spanish mobile-first dashboard shell", async () => {
    render(createElement(Home));

    expect(
      screen.getByRole("heading", { name: "Tu portafolio consolidado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Navegación principal" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Operaciones" })).toHaveAttribute(
      "href",
      "/trades",
    );
  });

  it("shows the empty state when the user has no trades", async () => {
    render(createElement(Home));

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Tu portafolio está vacío" }),
    ).toBeInTheDocument();
  });
});
