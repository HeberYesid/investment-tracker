import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SummaryCards } from "./summary-cards";

const summary = { ledgerStatus: "complete" as const, ledgerIssues: [], hasActiveTrades: true,
  equityUsd: "100", investedUsd: "75", realizedPnlUsd: "0", unrealizedPnlUsd: "25",
  totalPnlUsd: "25", returnPct: 33, twr: null, holdingsCount: 1,
  isAnyStale: true, isEstimated: false, staleTickers: ["AAPL"],
};

afterEach(() => vi.useRealTimers());

it("informa última actualización, motivo y próximo intento", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-17T22:00:00Z"));
  render(<SummaryCards summary={{ ...summary, sync: {
    lastSuccessAt: "2026-06-17T19:46:00Z", lastAttemptAt: "2026-06-17T21:48:00Z",
    nextRunEstimate: "2026-06-17T22:18:00Z", failedAssetCount: 1, lastFailureReason: "RATE_LIMITED",
  } }} />);
  expect(screen.getByTestId("summary-stale-banner")).toHaveTextContent("Última actualización: hace 2 h 14 min");
  expect(screen.getByText("Proveedor con límite de peticiones")).toBeInTheDocument();
  expect(screen.getByText("Próximo intento: en 18 min")).toBeInTheDocument();
});

it("no avisa por fallos ajenos y conserva el aviso básico sin diagnóstico", () => {
  const { rerender } = render(<SummaryCards summary={{ ...summary, shouldShowStaleBanner: false }} />);
  expect(screen.queryByTestId("summary-stale-banner")).not.toBeInTheDocument();
  rerender(<SummaryCards summary={summary} />);
  expect(screen.getByText("Precio desactualizado")).toBeInTheDocument();
});
