import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { TradesPageClient } from "./trades-page-client";
import type { TradeListResult } from "@/lib/trades/queries";
import type { TradeDTO } from "@/lib/validations/trades";

const trade: TradeDTO = {
  id: "550e8400-e29b-41d4-a716-446655440003",
  portfolio_id: "550e8400-e29b-41d4-a716-446655440000",
  broker_id: "550e8400-e29b-41d4-a716-446655440001",
  asset_id: "550e8400-e29b-41d4-a716-446655440002",
  trade_date: "2024-01-15",
  trade_type: "BUY",
  quantity: 1,
  price_original: "100",
  currency_original: "USD",
  commission_original: "0",
  fx_rate_to_usd: "1",
  source: "MANUAL",
  price_usd: "100",
  commission_usd: "0",
  total_invested_usd: "100",
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T10:00:00Z",
};

const initialData: TradeListResult = {
  data: [trade],
  meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
};

const mockUseSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mockUseSearchParams(),
  usePathname: () => "/trades",
}));

beforeEach(() => {
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 0 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TradesPageClient role-aware UI", () => {
  it("renders the row's edit and delete buttons when canWrite is true", () => {
    render(
      <TradesPageClient initialData={initialData} canWrite={true} />,
    );
    expect(screen.getByText("Editar")).toBeInTheDocument();
    expect(screen.getByText("Eliminar")).toBeInTheDocument();
  });

  it("hides the row's edit and delete buttons when canWrite is false", () => {
    render(
      <TradesPageClient initialData={initialData} canWrite={false} />,
    );
    expect(screen.queryByText("Editar")).not.toBeInTheDocument();
    expect(screen.queryByText("Eliminar")).not.toBeInTheDocument();
  });

  it("renders the read-only toast when ?denied=write is in the URL", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("denied=write"));

    render(
      <TradesPageClient initialData={initialData} canWrite={false} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /no puedes crear ni editar operaciones/i,
    );
  });

  it("does not render the read-only toast by default", () => {
    render(
      <TradesPageClient initialData={initialData} canWrite={false} />,
    );
    expect(
      screen.queryByText(/no puedes crear ni editar operaciones/i),
    ).not.toBeInTheDocument();
  });

  it("expands the filter panel and still hides the row's edit and delete buttons when canWrite is false", async () => {
    render(
      <TradesPageClient initialData={initialData} canWrite={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /filtros/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Tipo de operación")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Tipo de operación"), {
      target: { value: "SELL" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Editar")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Eliminar")).not.toBeInTheDocument();
  });
});
