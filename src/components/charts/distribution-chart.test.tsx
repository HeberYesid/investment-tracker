import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DistributionChart } from "@/components/charts/distribution-chart";

const initial = { dim: "broker" as const, totalUsd: "100", slices: [], unclassified: false, ledgerStatus: "complete" as const, ledgerIssues: [] };

afterEach(() => vi.unstubAllGlobals());

describe("Distribución de solo lectura", () => {
  it("muestra la fecha y la fuente de la cotización desactualizada", () => {
    render(<DistributionChart initial={{ ...initial, slices: [{
      key: "broker", label: "Bróker", valueUsd: "100", percent: 100, holdingsCount: 1,
      staleness: "stale", source: "STOOQ", observedAt: "2026-06-14T23:32:00Z",
    }] }} />);
    expect(screen.getByTitle("Cotización del 14 jun 18:32 · Fuente: Stooq")).toBeInTheDocument();
  });
  it("consulta las dimensiones y solo informa cuando faltan metadatos", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => Response.json({
      ...initial, dim: url.endsWith("sector") ? "sector" : "country", unclassified: true,
      slices: [{ key: "__unclassified__", label: "Sin clasificar", valueUsd: "100", percent: 100, holdingsCount: 1, staleness: "fresh" }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DistributionChart initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "Sector" }));
    expect(await screen.findByText("Sin clasificar")).toBeInTheDocument();
    expect(screen.getByText(/faltan metadatos/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enriquecer/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "País" }));
    expect(fetchMock.mock.calls).toEqual([
      ["/api/v1/dashboard/distribution?dim=sector"], ["/api/v1/dashboard/distribution?dim=country"],
    ]);
  });

  it("distingue un libro no conciliable de una distribución vacía", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...initial, dim: "sector", totalUsd: null,
      ledgerStatus: "unavailable", ledgerIssues: [{ code: "INVALID_TRADE", tradeDate: "2025-01-18" }] })));
    render(<DistributionChart initial={{ ...initial, totalUsd: "0" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Sector" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Hay operaciones con datos incompletos o no válidos.");
    expect(screen.queryByText("Sin datos de distribución.")).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "Sin datos de distribución." })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /descargar/i })).not.toBeInTheDocument();
  });
});
