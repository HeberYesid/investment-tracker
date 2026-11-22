import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReturnsTable } from "@/components/charts/returns-table";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import type { ReturnsResponse, SummaryResponse } from "@/lib/validations/dashboard";

const base = { ledgerStatus: "complete" as const, ledgerIssues: [], investedUsd: "0", realizedPnlUsd: "18",
  unrealizedPnlUsd: "0", totalPnlUsd: "18", returnPct: 0 };

it("resumen_cerrado_no_es_vacio", () => {
  const summary: SummaryResponse = { ...base, equityUsd: "0", hasActiveTrades: true, holdingsCount: 0,
    isEstimated: false, isAnyStale: false, staleTickers: [], twr: null };
  render(<DashboardView payload={{ summary, evolution: null, returns: null, snapshot: null }} />);
  expect(screen.queryByTestId("dashboard-empty")).not.toBeInTheDocument();
  const cards = within(screen.getByTestId("summary-cards"));
  expect(cards.getByText("Sin costo abierto")).toBeInTheDocument();
  expect(cards.getByText(/Realizado:.*18,00/)).toBeInTheDocument();
});

it('mantiene el orden y el signo de una pérdida en la portada', () => {
  const summary: SummaryResponse = { ...base, equityUsd: '800', investedUsd: '1000', totalPnlUsd: '-200', returnPct: -20,
    hasActiveTrades: true, holdingsCount: 1, isEstimated: false, isAnyStale: false, staleTickers: [], twr: null };
  render(<DashboardView payload={{ summary, evolution: null, returns: null, snapshot: null }} />);
  const metrics = screen.getAllByRole('article');
  expect(metrics.map(el => el.querySelector('p')?.textContent)).toEqual(['Equity total','Capital invertido','Ganancia / Pérdida','Rentabilidad']);
  for (const [i, value] of [800,1000,-200].entries()) expect(metrics[i].querySelectorAll('p')[1]?.textContent).toBe(new Intl.NumberFormat('es-CO',{style:'currency',currency:'USD'}).format(value));
  expect(metrics[3]).toHaveTextContent(/-20,00\s*%/);
});

it('conserva centavos y ambos avisos cuando conviven estimaciones y precios antiguos', () => {
  const summary: SummaryResponse = { ...base, equityUsd: '9007199254740993.17', investedUsd: '1', totalPnlUsd: '9007199254740992.17', returnPct: 1,
    hasActiveTrades: true, holdingsCount: 2, isEstimated: true, isAnyStale: true, shouldShowStaleBanner: true, staleTickers: ['DEMO'], twr: null };
  render(<DashboardView payload={{ summary, evolution: null, returns: null, snapshot: null }} />);
  expect(screen.getByTestId('summary-estimated-banner')).toHaveTextContent('Valores estimados');
  expect(screen.getByTestId('summary-stale-banner')).toHaveTextContent(/Precio desactualizado.*DEMO/);
  expect(screen.getAllByRole('article')[2]).toHaveTextContent(/9\.007\.199\.254\.740\.992,17/);
});

it("tabla_no_fusiona_homonimos; fallo_de_dimension_no_reetiqueta", async () => {
  const fakeFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
  try {
    const initial: ReturnsResponse = { groupBy: "stock", ledgerStatus: "complete", ledgerIssues: [], rows: [
      { ...base, key: "30000000-0000-4000-8000-000000000001", label: "ALFA · NYSE", actualUsd: "0" },
      { ...base, key: "30000000-0000-4000-8000-000000000002", label: "ALFA · BVC", actualUsd: "12", investedUsd: "12" },
    ] };
    render(<ReturnsTable initial={initial} />);
    expect(screen.getByRole("rowheader", { name: "ALFA · NYSE" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "ALFA · BVC" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Realizado" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Por bróker" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No se pudo/);
    expect(screen.getByRole("button", { name: "Por activo" })).toHaveAttribute("aria-pressed", "true");
  } finally { fakeFetch.mockRestore(); }
});
