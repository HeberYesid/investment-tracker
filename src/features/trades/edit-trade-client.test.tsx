import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditTradeClient } from "./edit-trade-client";
import type { TradeDTO } from "@/lib/validations/trades";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

describe("edición de una operación manual en COP", () => {
  it("muestra el activo y bróker sin permitir cambiarlos y guarda la tasa histórica", async () => {
    const trade: TradeDTO = {
      id: "b0000000-0000-4000-8000-000000000005",
      portfolio_id: "b0000000-0000-4000-8000-000000000002",
      broker_id: "b0000000-0000-4000-8000-000000000003",
      asset_id: "b0000000-0000-4000-8000-000000000004",
      ticker: "FXFIXTURE", broker_code: "TRII",
      trade_date: "2025-01-15", trade_type: "BUY", quantity: 1,
      price_original: "400000", currency_original: "COP", commission_original: "0",
      fx_rate_to_usd: "0.00025", price_usd: "100", commission_usd: "0", total_invested_usd: "100",
      source: "MANUAL", created_at: "2025-01-15T00:00:00Z", updated_at: "2025-01-15T00:00:00Z",
    };
    const fetchRequest = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetchRequest);
    render(<EditTradeClient trade={trade} />);

    const asset = screen.getByRole("textbox", { name: "Ticker" });
    const broker = screen.getByRole("textbox", { name: "Bróker" });
    expect(asset).toHaveValue("FXFIXTURE");
    expect(asset).toHaveAttribute("readonly");
    expect(broker).toHaveValue("TRII");
    expect(broker).toHaveAttribute("readonly");

    fireEvent.change(screen.getByRole("spinbutton", { name: "Cantidad" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(fetchRequest).toHaveBeenCalledTimes(1));
    const [url, request] = fetchRequest.mock.calls[0];
    expect(url).toBe(`/api/v1/trades/${trade.id}`);
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(request.body)).toMatchObject({ quantity: 2, fx_rate_to_usd: "0.00025000" });
  });
});
