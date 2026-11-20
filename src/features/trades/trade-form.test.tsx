import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TradeForm, type TradeFormValues } from "./trade-form";

const initialData = {
  trade_date: "2025-01-15",
  broker_code: "TRII",
  ticker: "PRUEBA",
  quantity: 1,
  price_original: 380_000,
} satisfies Partial<TradeFormValues>;

function quote() {
  return Response.json({
    fromCurrency: "COP",
    toCurrency: "USD",
    rate: 0.00026316,
    observedAt: "2025-01-15T12:00:00Z",
    isStale: false,
    source: "fixture",
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("tasa de cambio del formulario de operaciones", () => {
  it("solicita COP→USD solo al elegir COP y usa el multiplicador sin repetir la consulta", async () => {
    const fetchFx = vi.fn().mockImplementation(async () => quote());
    vi.stubGlobal("fetch", fetchFx);
    const submit = vi.fn();
    render(<TradeForm mode="create" initialData={initialData} onSubmit={submit} />);

    expect(fetchFx).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Moneda"), { target: { value: "COP" } });
    const rateInput = screen.getByRole("spinbutton", { name: /tasa de cambio/i });
    await waitFor(() => expect(rateInput).toHaveValue(0.00026316));
    expect(fetchFx).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/fx/latest?from=COP&to=USD", expect.anything(),
    );

    fireEvent.change(rateInput, { target: { value: "0.00025" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(submit.mock.calls[0]?.[0]).toMatchObject({
      currency_original: "COP", fx_rate_to_usd: 0.00025,
    }));
    expect(fetchFx).toHaveBeenCalledTimes(1);
  });

  it("no sobrescribe la tasa que se escribe mientras llega la respuesta", async () => {
    const { promise, resolve } = Promise.withResolvers<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(promise));
    render(<TradeForm mode="create" initialData={{ ...initialData, currency_original: "COP" }} onSubmit={vi.fn()} />);
    const rateInput = screen.getByRole("spinbutton", { name: /tasa de cambio/i });
    fireEvent.change(rateInput, { target: { value: "0.00025" } });
    await act(async () => resolve(quote()));
    expect(rateInput).toHaveValue(0.00025);
  });

  it("conserva una tasa histórica y envía 1 al cambiar la moneda a USD", async () => {
    const fetchFx = vi.fn();
    vi.stubGlobal("fetch", fetchFx);
    const submit = vi.fn();
    render(<TradeForm mode="edit" initialData={{
      ...initialData, currency_original: "COP", fx_rate_to_usd: 0.00025,
    }} onSubmit={submit} />);
    expect(screen.getByRole("spinbutton", { name: /tasa de cambio/i })).toHaveValue(0.00025);
    expect(fetchFx).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("spinbutton", { name: /tasa de cambio/i }), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Moneda"), { target: { value: "USD" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(submit.mock.calls[0]?.[0]).toMatchObject({
      currency_original: "USD", fx_rate_to_usd: 1,
    }));
  });
});
