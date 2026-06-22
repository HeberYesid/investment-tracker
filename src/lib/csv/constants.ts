export const PRICE_PRECISION_MULTIPLIER = 1_000_000;
export const MONEY_PRECISION_MULTIPLIER = 100;

export function roundPrice(value: number): number {
  return Math.round(value * PRICE_PRECISION_MULTIPLIER) / PRICE_PRECISION_MULTIPLIER;
}

export function roundMoney(value: number): number {
  return Math.round(value * MONEY_PRECISION_MULTIPLIER) / MONEY_PRECISION_MULTIPLIER;
}

export const VALID_ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export type PortfolioRole = typeof VALID_ROLES[number];

export function isValidRole(role: string): role is PortfolioRole {
  return VALID_ROLES.includes(role as PortfolioRole);
}
