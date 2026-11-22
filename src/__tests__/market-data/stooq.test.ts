import { describe, expect, it, vi } from "vitest";
import { createStooqProvider } from "@/lib/market-data/stooq";

const valid = "Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-06-17,21:00:00,191.50,193.10,190.80,192.40,12345678\n";

describe("Stooq", () => {
  it("normaliza una cotización USD con el símbolo solicitado", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(valid));
    const provider = createStooqProvider({ fetchImpl });
    await expect(provider.fetchQuotes(["AAPL"])).resolves.toEqual([{
      symbol: "AAPL", priceUsd: 192.4, currency: "USD", observedAt: "2026-06-17T21:00:00.000Z", delayedUntil: null,
    }]);
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get("s")).toBe("aapl.us");
  });

  it.each([
    ["INVALID_PAYLOAD", () => new Response(valid.replace("192.40", "N/D"))],
    ["INVALID_PAYLOAD", () => new Response(valid.replace("AAPL.US", "MSFT.US"))],
    ["RATE_LIMITED", () => new Response(null, { status: 429 })],
    ["TRANSIENT", () => { throw new Error("offline"); }],
  ])("clasifica el fallo como %s", async (code, response) => {
    const fetchImpl = vi.fn(async () => response());
    await expect(createStooqProvider({ fetchImpl }).fetchQuotes(["AAPL"])).rejects.toMatchObject({ code });
  });

  it.each(["ECOPETROL.CL", "BTC-USD", "^GSPC"])("omite %s sin consultar la red", async (symbol) => {
    const fetchImpl = vi.fn();
    await expect(createStooqProvider({ fetchImpl }).fetchQuotes([symbol])).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
