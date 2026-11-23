import { MONEY_SCALE } from "@/lib/calculations/position-ledger";

export function formatLedgerMoney(value: bigint): string {
  const negative = value < 0n;
  const amount = negative ? -value : value;
  const tail = (amount % MONEY_SCALE).toString().padStart(24, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${amount / MONEY_SCALE}${tail ? `.${tail}` : ""}`;
}
