import { describe, it, expect } from "vitest";
import {
  parseXtbTradeComment,
  normalizeXtbTicker,
} from "@/lib/csv/xtb-comment-parser";

describe("parseXtbTradeComment", () => {
  it("parses 'OPEN BUY 0.1188 @ 252.39' as BUY", () => {
    const result = parseXtbTradeComment("OPEN BUY 0.1188 @ 252.39");
    expect(result).toEqual({ type: "BUY", volume: 0.1188, price: 252.39 });
  });

  it("parses 'OPEN BUY 2/4.3509 @ 24.88' as BUY (ignores denominator)", () => {
    const result = parseXtbTradeComment("OPEN BUY 2/4.3509 @ 24.88");
    expect(result).toEqual({ type: "BUY", volume: 2, price: 24.88 });
  });

  it("parses 'CLOSE BUY 2/4.3509 @ 21.80' as SELL", () => {
    const result = parseXtbTradeComment("CLOSE BUY 2/4.3509 @ 21.80");
    expect(result).toEqual({ type: "SELL", volume: 2, price: 21.80 });
  });

  it("parses 'CLOSE BUY 0.0104/4.3509 @ 21.77' as SELL", () => {
    const result = parseXtbTradeComment("CLOSE BUY 0.0104/4.3509 @ 21.77");
    expect(result).toEqual({ type: "SELL", volume: 0.0104, price: 21.77 });
  });

  it("parses 'OPEN SELL 0.5 @ 100.00' as SELL", () => {
    const result = parseXtbTradeComment("OPEN SELL 0.5 @ 100.00");
    expect(result).toEqual({ type: "SELL", volume: 0.5, price: 100.0 });
  });

  it("parses 'CLOSE SELL 1 @ 50' as BUY", () => {
    const result = parseXtbTradeComment("CLOSE SELL 1 @ 50");
    expect(result).toEqual({ type: "BUY", volume: 1, price: 50 });
  });

  it("returns null for non-trade comments", () => {
    expect(parseXtbTradeComment("V.US USD WHT 30%")).toBeNull();
    expect(parseXtbTradeComment("Cashback")).toBeNull();
    expect(parseXtbTradeComment("")).toBeNull();
  });

  it("is case insensitive", () => {
    const result = parseXtbTradeComment("open buy 1.5 @ 100.00");
    expect(result?.type).toBe("BUY");
  });
});

describe("normalizeXtbTicker", () => {
  it("strips .US suffix", () => {
    expect(normalizeXtbTicker("LULU.US")).toBe("LULU");
    expect(normalizeXtbTicker("V.US")).toBe("V");
    expect(normalizeXtbTicker("NVO.US")).toBe("NVO");
  });

  it("uppercases ticker", () => {
    expect(normalizeXtbTicker("aapl.us")).toBe("AAPL");
  });

  it("handles ticker without suffix", () => {
    expect(normalizeXtbTicker("AAPL")).toBe("AAPL");
  });
});
