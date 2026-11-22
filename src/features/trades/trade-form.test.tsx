import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TradeForm, type TradeFormValues } from "./trade-form";
import { getTradeLabels } from "@/lib/i18n/trades";

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

describe("formulario_fee_exige_cero_sin_resetear_cantidad", () => {
  const labels = getTradeLabels();

  it("en alta exige un cero ingresado, conserva la referencia y envía un número", async () => {
    const submit = vi.fn();
    render(<TradeForm mode="create" initialData={{ ...initialData, quantity: undefined }} onSubmit={submit} />);
    const quantity = screen.getByLabelText(labels.quantity);
    fireEvent.change(screen.getByLabelText(labels.tradeType), { target: { value: "FEE" } });
    expect(quantity).toHaveValue(null);
    expect(quantity).toHaveAccessibleDescription(labels.feeQuantityZero);

    const reference = screen.getByLabelText("Referencia del instrumento");
    expect(reference).toBeInvalid();
    fireEvent.change(reference, { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("Mercado"), { target: { value: "BVC" } });
    fireEvent.change(screen.getByLabelText("Moneda de cotización"), { target: { value: "COP" } });
    fireEvent.change(screen.getByLabelText("Tipo de instrumento"), { target: { value: "STOCK" } });
    const save = screen.getByRole("button", { name: labels.save });
    fireEvent.click(save);
    expect(await screen.findByText(labels.quantityNumberRequired)).toBeVisible();
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(quantity).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();

    fireEvent.change(quantity, { target: { value: "0" } });
    fireEvent.click(save);
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      trade_type: "FEE", quantity: 0, asset_reference: { kind: "new", exchange: "BVC", currency: "COP", asset_type: "STOCK" },
    })));
  });

  it("en edición no muta una comisión histórica ni resetea cantidad al cambiar de tipo", async () => {
    const submit = vi.fn();
    render(<TradeForm mode="edit" initialData={{ ...initialData, trade_type: "FEE" }} onSubmit={submit} />);
    const quantity = screen.getByLabelText(labels.quantity);
    const type = screen.getByLabelText(labels.tradeType);
    const save = screen.getByRole("button", { name: labels.save });
    expect(quantity).toHaveValue(1);
    expect(quantity).toHaveAttribute("aria-invalid", "false");
    fireEvent.click(save);
    await waitFor(() => expect(quantity).toHaveAttribute("aria-invalid", "true"));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(type, { target: { value: "BUY" } });
    expect(quantity).toHaveValue(1);
    fireEvent.change(type, { target: { value: "FEE" } });
    expect(quantity).toHaveValue(1);
    fireEvent.change(quantity, { target: { value: "0" } });
    fireEvent.click(save);
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ trade_type: "FEE", quantity: 0 })));
  });

  it.each(["BUY", "SELL", "DIVIDEND", "TRANSFER_IN", "TRANSFER_OUT"] as const)("%s rechaza cero y acepta una fracción", async (trade_type) => {
    const submit = vi.fn();
    render(<TradeForm mode="edit" initialData={{ ...initialData, trade_type, quantity: 0 }} onSubmit={submit} />);
    const quantity = screen.getByLabelText(labels.quantity);
    const save = screen.getByRole("button", { name: labels.save });
    fireEvent.click(save);
    expect(await screen.findByText(labels.quantityPositiveAtScale)).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(quantity, { target: { value: "0.25" } });
    fireEvent.click(save);
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ trade_type, quantity: 0.25 })));
  });
});

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
    fireEvent.change(screen.getByLabelText("Referencia del instrumento"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("Mercado"), { target: { value: "BVC" } });
    fireEvent.change(screen.getByLabelText("Moneda de cotización"), { target: { value: "COP" } });
    fireEvent.change(screen.getByLabelText("Tipo de instrumento"), { target: { value: "STOCK" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(submit.mock.calls[0]?.[0]).toMatchObject({
      currency_original: "COP", fx_rate_to_usd: 0.00025,
      asset_reference: { kind: "new", exchange: "BVC", currency: "COP", asset_type: "STOCK" },
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
