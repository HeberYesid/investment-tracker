import { describe, expect, it } from "vitest";

import { BROKER_SEEDS } from "./brokers";

describe("broker seeds", () => {
  it("contains the four supported brokers with their default currencies", () => {
    expect(BROKER_SEEDS).toEqual([
      { code: "ETORO", name: "eToro", defaultCurrency: "USD" },
      { code: "XTB", name: "XTB", defaultCurrency: "USD" },
      { code: "TRII", name: "Trii", defaultCurrency: "COP" },
      {
        code: "ETRADING_BANCOLOMBIA",
        name: "eTrading Bancolombia",
        defaultCurrency: "COP",
      },
    ]);
  });
});
