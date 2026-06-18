import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DistributionChart } from "@/components/charts/distribution-chart";

const basePayload = {
  dim: "broker" as const,
  totalUsd: 0,
  slices: [],
  unclassified: true,
};

function renderChart(initial = basePayload) {
  return render(createElement(DistributionChart, { initial }));
}

describe("DistributionChart — enrich button", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the enrich button when unclassified is true", () => {
    renderChart();
    expect(
      screen.getByTestId("distribution-enrich-button"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enriquecer sectores y países" }),
    ).toBeInTheDocument();
  });

  it("hides the enrich button when unclassified is false", () => {
    renderChart({ ...basePayload, unclassified: false });
    expect(screen.queryByTestId("distribution-enrich-button")).toBeNull();
  });

  it("loops through backfill pages until nextOffset is null and reloads the chart", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            processed: 2,
            succeeded: 2,
            notFound: 0,
            failed: 0,
            tickers: [],
            nextOffset: 2,
            totalRemaining: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            processed: 1,
            succeeded: 1,
            notFound: 0,
            failed: 0,
            tickers: [],
            nextOffset: null,
            totalRemaining: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            dim: "broker",
            totalUsd: 0,
            slices: [],
            unclassified: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    renderChart();
    fireEvent.click(screen.getByTestId("distribution-enrich-button"));

    await waitFor(() => {
      expect(screen.getByTestId("distribution-enrich-message")).toHaveTextContent(
        "Se enriquecieron 3 activos",
      );
    });

    const backfillCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === "/api/v1/admin/backfill-asset-metadata",
    );
    expect(backfillCalls).toHaveLength(2);
    const reloadCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/api/v1/dashboard/distribution"),
    );
    expect(reloadCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("shows a forbidden message when the API returns 403", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: "FORBIDDEN" } }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderChart();
    fireEvent.click(screen.getByTestId("distribution-enrich-button"));

    await waitFor(() => {
      expect(screen.getByTestId("distribution-enrich-message")).toHaveTextContent(
        "Solo los propietarios pueden ejecutar el enriquecimiento.",
      );
    });
  });

  it("shows a partial message when some assets fail to enrich", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            processed: 5,
            succeeded: 3,
            notFound: 1,
            failed: 1,
            tickers: [],
            nextOffset: null,
            totalRemaining: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            dim: "broker",
            totalUsd: 0,
            slices: [],
            unclassified: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    renderChart();
    fireEvent.click(screen.getByTestId("distribution-enrich-button"));

    await waitFor(() => {
      expect(screen.getByTestId("distribution-enrich-message")).toHaveTextContent(
        "Se enriquecieron 3 activos. 2 no se pudieron clasificar.",
      );
    });
  });

  it("shows a clear 'no profile' message when every asset is missing a Yahoo profile", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            processed: 19,
            succeeded: 0,
            notFound: 19,
            failed: 0,
            tickers: [],
            nextOffset: null,
            totalRemaining: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            dim: "broker",
            totalUsd: 0,
            slices: [],
            unclassified: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    renderChart();
    fireEvent.click(screen.getByTestId("distribution-enrich-button"));

    await waitFor(() => {
      expect(screen.getByTestId("distribution-enrich-message")).toHaveTextContent(
        "No se encontró perfil en Yahoo para ninguno de los 19 activos",
      );
    });
  });

  it("disables the button while a backfill is in progress", async () => {
    let resolveBackfill: (value: Response) => void = () => {
      throw new Error("not initialized");
    };
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveBackfill = resolve;
        }),
    );

    renderChart();
    const button = screen.getByTestId("distribution-enrich-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("Enriqueciendo...");
    });

    resolveBackfill(
      new Response(
        JSON.stringify({
          processed: 0,
          succeeded: 0,
          notFound: 0,
          failed: 0,
          tickers: [],
          nextOffset: null,
          totalRemaining: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });
});
