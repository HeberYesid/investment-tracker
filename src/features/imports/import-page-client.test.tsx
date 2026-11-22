import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getImportLabels } from "@/lib/i18n/imports";

import { ImportPageClient } from "./import-page-client";

const portfolioId = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ImportPageClient role-aware rendering", () => {
  it("renders the read-only banner and import history when readOnly is true", () => {
    render(
      <ImportPageClient portfolioId={portfolioId} readOnly={true} />,
    );

    expect(
      screen.getByRole("heading", { name: "Solo lectura" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no puedes importar nuevas operaciones/i),
    ).toBeInTheDocument();
  });

  it("does not render the broker-selection step when readOnly is true", () => {
    render(
      <ImportPageClient portfolioId={portfolioId} readOnly={true} />,
    );

    expect(
      screen.queryByRole("heading", { name: "Seleccionar bróker" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Subir archivo" }),
    ).not.toBeInTheDocument();
  });

  it("renders the broker-selection step when readOnly is false", () => {
    render(
      <ImportPageClient portfolioId={portfolioId} readOnly={false} />,
    );

    expect(
      screen.getByRole("heading", { name: "Seleccionar bróker" }),
    ).toBeInTheDocument();
  });

  it("does not render the read-only banner when readOnly is false", () => {
    render(
      <ImportPageClient portfolioId={portfolioId} readOnly={false} />,
    );

    expect(
      screen.queryByRole("heading", { name: "Solo lectura" }),
    ).not.toBeInTheDocument();
  });

  it("fetches import history regardless of the readOnly state", async () => {
    render(
      <ImportPageClient portfolioId={portfolioId} readOnly={true} />,
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/v1/imports/history");
    });
  });
});

it("xtb_no_oculta_cargos_reconocidos: muestra el motivo sin candidata, referencia ni confirmación", async () => {
  const labels = getImportLabels();
  const reason = labels.xtbFeeIssues.XTB_FEE_AMOUNT;
  vi.mocked(fetch).mockImplementation(async (url) => Response.json(url === "/api/v1/imports/csv/preview" ? {
    import: { id: "import" },
    rows: [{ id: "row", row_number: 1, valid: false, error: reason, parsed: null }],
    summary: { total: 1, valid: 0, invalid: 1 },
  } : { data: [] }));
  render(<ImportPageClient portfolioId={portfolioId} readOnly={false} />);
  fireEvent.click(screen.getByRole("button", { name: /XTB/ }));
  fireEvent.change(screen.getByLabelText(labels.dragDrop), {
    target: { files: [new File(["fixture"], "xtb.xlsx")] },
  });
  fireEvent.click(screen.getByRole("button", { name: labels.preview }));
  expect(await screen.findByText(reason)).toBeVisible();
  expect(screen.queryByRole("button", { name: labels.confirmImport })).not.toBeInTheDocument();
  expect(screen.queryByText("Buscar referencias")).not.toBeInTheDocument();
});
