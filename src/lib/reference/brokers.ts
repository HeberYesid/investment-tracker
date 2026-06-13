export type BrokerCode = "ETORO" | "XTB" | "TRII" | "ETRADING_BANCOLOMBIA";

export type BrokerSeed = {
  code: BrokerCode;
  name: string;
  defaultCurrency: "USD" | "COP";
};

export const BROKER_SEEDS: BrokerSeed[] = [
  { code: "ETORO", name: "eToro", defaultCurrency: "USD" },
  { code: "XTB", name: "XTB", defaultCurrency: "USD" },
  { code: "TRII", name: "Trii", defaultCurrency: "COP" },
  {
    code: "ETRADING_BANCOLOMBIA",
    name: "eTrading Bancolombia",
    defaultCurrency: "COP",
  },
];
