import { describe, it, expect } from "vitest";
import {
  CreateTradeInput,
  TradeFormInput,
  TradeListQuery,
  normalizeTradeUsdValues,
} from "@/lib/validations/trades";

const UUID_A = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";
const UUID_C = "550e8400-e29b-41d4-a716-446655440002";

function validBuyInput(overrides: Record<string, unknown> = {}) {
  return {
    portfolio_id: UUID_A,
    broker_id: UUID_B,
    asset_id: UUID_C,
    trade_date: "2025-06-01",
    trade_type: "BUY" as const,
    quantity: 10,
    price_original: 100,
    currency_original: "USD" as const,
    commission_original: 5,
    fx_rate_to_usd: 1,
    source: "MANUAL" as const,
    ...overrides,
  };
}

describe("CreateTradeInput validation", () => {
  it("valid BUY trade passes validation", () => {
    const result = CreateTradeInput.safeParse(validBuyInput());
    expect(result.success).toBe(true);
  });

  it("missing required field trade_date fails", () => {
    const { trade_date: _trade_date, ...input } = validBuyInput();
    const result = CreateTradeInput.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("COP trade without FX rate fails with Spanish error message", () => {
    const result = CreateTradeInput.safeParse(
      validBuyInput({ currency_original: "COP", fx_rate_to_usd: 1 }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const fxIssue = result.error.issues.find((i) => i.path.includes("fx_rate_to_usd"));
      expect(fxIssue).toBeDefined();
      expect(fxIssue!.message).toContain("COP");
    }
  });

  it("USD trade with default fx_rate=1 passes", () => {
    const { fx_rate_to_usd: _fx_rate_to_usd, ...input } = validBuyInput();
    const result = CreateTradeInput.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fx_rate_to_usd).toBe(1);
    }
  });

  it("negative quantity fails", () => {
    const result = CreateTradeInput.safeParse(validBuyInput({ quantity: -5 }));
    expect(result.success).toBe(false);
  });

  it("invalid UUID fails", () => {
    const result = CreateTradeInput.safeParse(validBuyInput({ portfolio_id: "not-a-uuid" }));
    expect(result.success).toBe(false);
  });

  it("defaults commission_original to 0", () => {
    const { commission_original: _commission_original, ...input } = validBuyInput();
    const result = CreateTradeInput.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.commission_original).toBe(0);
    }
  });
});

describe("normalizeTradeUsdValues", () => {
  it("BUY calculation converts correctly", () => {
    const input = CreateTradeInput.parse(validBuyInput({ commission_original: 5 }));
    const result = normalizeTradeUsdValues(input);
    expect(result.price_usd).toBe(100);
    expect(result.commission_usd).toBe(5);
    expect(result.total_invested_usd).toBe(1005);
  });

  it("SELL total_invested_usd is negative", () => {
    const input = CreateTradeInput.parse(validBuyInput({ trade_type: "SELL", commission_original: 3 }));
    const result = normalizeTradeUsdValues(input);
    expect(result.total_invested_usd).toBe(-(10 * 100 - 3));
    expect(result.total_invested_usd).toBe(-997);
  });

  it("COP trade converts using fx_rate", () => {
    const input = CreateTradeInput.parse(
      validBuyInput({
        quantity: 100,
        price_original: 5000,
        currency_original: "COP",
        fx_rate_to_usd: 0.00025,
        commission_original: 0,
      }),
    );
    const result = normalizeTradeUsdValues(input);
    expect(result.price_usd).toBeCloseTo(1.25);
    expect(result.commission_usd).toBe(0);
    expect(result.total_invested_usd).toBeCloseTo(125);
  });

  it("DIVIDEND total_invested_usd is negative", () => {
    const input = CreateTradeInput.parse(
      validBuyInput({ trade_type: "DIVIDEND", quantity: 50, price_original: 0.5 }),
    );
    const result = normalizeTradeUsdValues(input);
    expect(result.total_invested_usd).toBeCloseTo(-25);
  });

  it("FEE total_invested_usd equals commission_usd", () => {
    const input = CreateTradeInput.parse(
      validBuyInput({ trade_type: "FEE", quantity: 1, commission_original: 15 }),
    );
    const result = normalizeTradeUsdValues(input);
    expect(result.total_invested_usd).toBe(15);
  });

  it("TRANSFER_IN total_invested_usd is positive", () => {
    const input = CreateTradeInput.parse(
      validBuyInput({ trade_type: "TRANSFER_IN", quantity: 20, price_original: 50 }),
    );
    const result = normalizeTradeUsdValues(input);
    expect(result.total_invested_usd).toBe(1000);
  });

  it("TRANSFER_OUT total_invested_usd is negative", () => {
    const input = CreateTradeInput.parse(
      validBuyInput({ trade_type: "TRANSFER_OUT", quantity: 20, price_original: 50 }),
    );
    const result = normalizeTradeUsdValues(input);
    expect(result.total_invested_usd).toBe(-1000);
  });
});

describe("TradeListQuery", () => {
  it("parses string numbers for page and limit", () => {
    const result = TradeListQuery.safeParse({ page: "2", limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(50);
    }
  });

  it("applies defaults when fields are missing", () => {
    const result = TradeListQuery.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("rejects limit over 100", () => {
    const result = TradeListQuery.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });
});

describe("TradeFormInput validation", () => {
  function validFormInput(overrides: Record<string, unknown> = {}) {
    return {
      trade_date: "2025-06-01",
      trade_type: "BUY" as const,
      broker_code: "ETORO",
      ticker: "AAPL",
      quantity: 10,
      price_original: 100,
      currency_original: "USD" as const,
      commission_original: 0,
      fx_rate_to_usd: 1,
      ...overrides,
    };
  }

  it("valid form input passes", () => {
    const result = TradeFormInput.safeParse(validFormInput());
    expect(result.success).toBe(true);
  });

  it("missing broker_code fails", () => {
    const { broker_code: _broker_code, ...input } = validFormInput();
    const result = TradeFormInput.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("ticker is uppercased", () => {
    const result = TradeFormInput.safeParse(validFormInput({ ticker: "aapl" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ticker).toBe("AAPL");
    }
  });

  it("COP without FX rate fails", () => {
    const result = TradeFormInput.safeParse(
      validFormInput({ currency_original: "COP", fx_rate_to_usd: 1 }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const fxIssue = result.error.issues.find((i) => i.path.includes("fx_rate_to_usd"));
      expect(fxIssue).toBeDefined();
      expect(fxIssue!.message).toContain("COP");
    }
  });
});
