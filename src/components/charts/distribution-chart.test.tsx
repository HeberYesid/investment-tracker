import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DistributionChart } from "@/components/charts/distribution-chart";

const initial = { dim: "broker" as const, totalUsd: 100, slices: [], unclassified: false };

afterEach(() => vi.unstubAllGlobals());

describe("Distribución de solo lectura", () => {
  it("consulta las dimensiones y solo informa cuando faltan metadatos", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => Response.json({
      ...initial, dim: url.endsWith("sector") ? "sector" : "country", unclassified: true,
      slices: [{ key: "__unclassified__", label: "Sin clasificar", valueUsd: 100, percent: 100, holdingsCount: 1, staleness: "fresh" }],
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
});
