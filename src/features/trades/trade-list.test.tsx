import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TradeList } from "./trade-list";
import type { TradeDTO } from "@/lib/validations/trades";

const trade: TradeDTO = {
  id: "550e8400-e29b-41d4-a716-446655440003",
  portfolio_id: "550e8400-e29b-41d4-a716-446655440000",
  broker_id: "550e8400-e29b-41d4-a716-446655440001",
  asset_id: "550e8400-e29b-41d4-a716-446655440002",
  trade_date: "2024-01-15",
  trade_type: "BUY",
  quantity: 1,
  price_original: 100,
  currency_original: "USD",
  commission_original: 0,
  fx_rate_to_usd: 1,
  source: "MANUAL",
  price_usd: 100,
  commission_usd: 0,
  total_invested_usd: 100,
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T10:00:00Z",
};

describe("TradeList role-aware rendering", () => {
  it("shows the edit and delete buttons when canWrite is true", () => {
    render(
      <TradeList
        trades={[trade]}
        onEdit={() => {}}
        onDelete={() => {}}
        canWrite={true}
      />,
    );
    expect(screen.getByText("Editar")).toBeInTheDocument();
    expect(screen.getByText("Eliminar")).toBeInTheDocument();
  });

  it("hides the edit and delete buttons when canWrite is false", () => {
    render(
      <TradeList
        trades={[trade]}
        onEdit={() => {}}
        onDelete={() => {}}
        canWrite={false}
      />,
    );
    expect(screen.queryByText("Editar")).not.toBeInTheDocument();
    expect(screen.queryByText("Eliminar")).not.toBeInTheDocument();
  });

  it("renders the empty state when there are no trades", () => {
    render(
      <TradeList
        trades={[]}
        onEdit={() => {}}
        onDelete={() => {}}
        canWrite
      />,
    );
    expect(screen.getByText("No hay operaciones registradas")).toBeInTheDocument();
  });
});
