import type { SupabaseClient } from "@supabase/supabase-js";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DashboardDataLoader } from "@/features/dashboard/dashboard-data-loader";
import { MonthlySummaryCard } from "@/features/dashboard/monthly-summary-card";
import type { DashboardPayload } from "@/features/dashboard/use-dashboard-data";
import type { MonthlyPortfolioSummary } from "@/lib/dashboard/monthly-summary-types";

const { aggregate, demoAggregate, reload } = vi.hoisted(() => ({ aggregate: vi.fn(), demoAggregate: vi.fn(), reload: vi.fn() }));
vi.mock("@/lib/dashboard/aggregate", () => ({ loadDashboardAggregate: aggregate }));
vi.mock("@/lib/dashboard/demo-loader", () => ({ loadDemoDashboardAggregate: demoAggregate }));
vi.mock("@/features/dashboard/use-date-filters", () => ({
  useDateFilters: () => ({ from: "", to: "", setFilters: vi.fn(), queryString: "" }),
}));
vi.mock("@/features/dashboard/use-dashboard-data", () => ({
  useDashboardData(initial: DashboardPayload) {
    const [phase, setPhase] = useState<"error" | "loading" | "ready">("error");
    return {
      loading: phase === "loading",
      error: phase === "error" ? "Falló la gráfica" : null,
      payload: initial,
      reload: async () => {
        setPhase("loading");
        await reload();
        setPhase("ready");
      },
    };
  },
}));

const summary: MonthlyPortfolioSummary = {
  openingCutoffDate: "2024-12-31", startDate: "2025-01-01", endDate: "2025-01-31",
  openingValueUsd: "1000", openingReason: null, closingValueUsd: "0", closingReason: null,
  changeUsd: "-1000", activity: { BUY: 0, SELL: 1, TRANSFER_IN: 0, TRANSFER_OUT: 0, DIVIDEND: 0, FEE: 0 }, activityReason: null,
};

describe("tarjeta de resumen mensual", () => {
  it("distingue cero y no disponible en la tarjeta", () => {
    const { rerender } = render(<MonthlySummaryCard result={{ kind: "summary", summary }} />);
    const card = screen.getByTestId("monthly-summary");
    expect(within(card).getByRole("heading", { name: "Resumen mensual", level: 2 })).toBeVisible();
    expect(Array.from(card.querySelectorAll("time"), (node) => node.dateTime)).toEqual([
      "2025-01-01", "2025-01-31", "2024-12-31", "2025-01-31",
    ]);
    expect(within(card).getByText(/Valor inicial/).closest("dt")?.querySelector("time")).toHaveAttribute("datetime", "2024-12-31");
    expect(within(card).getByText(/Valor final/).closest("dt")?.querySelector("time")).toHaveAttribute("datetime", "2025-01-31");
    expect(within(card).getByText("USD 1.000,00")).toBeVisible();
    expect(within(card).getByText("USD 0,00")).toBeVisible();
    expect(within(card).getByText("Cambio de valor").nextElementSibling).toHaveTextContent("-USD 1.000,00");
    expect(within(card).getByText(/precios históricos ajustados de la fuente/)).toHaveTextContent(/no es un cierre contable/);
    for (const [label, count] of [["Compras", "0"], ["Ventas", "1"], ["Transferencias entrantes de títulos", "0"],
      ["Transferencias salientes de títulos", "0"], ["Dividendos", "0"], ["Comisiones", "0"]]) {
      const term = within(card).getByText(label);
      expect(term.tagName).toBe("DT");
      expect(term.nextElementSibling).toHaveTextContent(count);
    }
    expect(card.querySelector("[tabindex], button, a, input")).toBeNull();
    expect(card).not.toHaveTextContent(/rentabilidad|ganancia|pérdida|depósitos|retiros|aportes|%/i);

    rerender(<MonthlySummaryCard result={{ kind: "summary", summary: {
      ...summary, openingValueUsd: null, openingReason: "NO_HISTORY", changeUsd: null,
    } }} />);
    expect(within(card).getAllByText("No disponible")).toHaveLength(2);
    expect(within(card).getByText(/No hay operaciones registradas hasta esa fecha/)).toBeVisible();
    expect(within(card).getByText("USD 0,00")).toBeVisible();
    expect(within(card).getByText("Ventas").nextElementSibling).toHaveTextContent("1");

    rerender(<MonthlySummaryCard result={{ kind: "summary", summary: { ...summary, closingValueUsd: "1320", changeUsd: "320" } }} />);
    expect(within(card).getByText("+USD 320,00")).toBeVisible();
  });

  it("explica los datos incompletos y distingue historial no verificado de ausencia", () => {
    const { rerender } = render(<MonthlySummaryCard result={{ kind: "summary", summary: {
      ...summary, openingValueUsd: null, closingValueUsd: null, changeUsd: null, activity: null,
      openingReason: "INCOMPLETE_TRADES", closingReason: "INCOMPLETE_TRADES", activityReason: "INCOMPLETE_TRADES",
    } }} />);
    expect(screen.getAllByText("No disponible")).toHaveLength(4);
    expect(screen.getByText(/datos de operaciones están incompletos/i)).toBeVisible();
    expect(screen.queryByText("USD 0,00")).not.toBeInTheDocument();
    rerender(<MonthlySummaryCard result={{ kind: "history-unverified" }} />);
    expect(screen.queryByTestId("monthly-summary")).not.toBeInTheDocument();
    expect(screen.getByText("No se pudo comprobar el historial del resumen mensual")).toBeVisible();
    rerender(<MonthlySummaryCard result={{ kind: "absent" }} />);
    expect(screen.queryByText(/No se pudo comprobar/)).not.toBeInTheDocument();
  });

  it("conserva el resumen al fallar y reintentar el gráfico", async () => {
    let completeReload!: () => void;
    reload.mockReturnValueOnce(new Promise<void>((resolve) => { completeReload = resolve; }));
    const supabase = {} as SupabaseClient;
    aggregate.mockResolvedValueOnce({ monthlySummary: { kind: "summary", summary } });
    render(await DashboardDataLoader({ context: {
      kind: "active", supabase, user: { id: "user", aud: "authenticated", created_at: "", app_metadata: {}, user_metadata: {} }, options: [], portfolio: {
        portfolioId: "active", role: "OWNER", portfolio: { id: "active", name: "Activo", base_currency: "USD" },
      },
    } }));
    expect(aggregate).toHaveBeenCalledWith("active", supabase, "full", expect.objectContaining({ includeMonthlySummary: true }));
    expect(demoAggregate).not.toHaveBeenCalled();
    const card = screen.getByTestId("monthly-summary");
    const original = card.textContent;
    expect(screen.getByRole("alert")).toHaveTextContent("Falló la gráfica");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getByTestId("dashboard-reloading")).toBeVisible();
    expect(screen.getByTestId("monthly-summary")).toBe(card);
    expect(card.textContent).toBe(original);
    completeReload();
    await vi.waitFor(() => expect(screen.queryByTestId("dashboard-reloading")).not.toBeInTheDocument());
    expect(screen.getByTestId("dashboard-ready")).toBeVisible();
    expect(screen.getByTestId("monthly-summary")).toBe(card);
    expect(card.textContent).toBe(original);
    expect(aggregate).toHaveBeenCalledOnce();
  });
});
