import { z } from "zod";

import { VALID_ROLES } from "@/lib/csv/constants";

export const PortfolioId = z.guid().transform((value) => value.toLowerCase());

export const SelectPortfolioInput = z.object({ portfolio_id: PortfolioId });

export const PortfolioMemberships = z.array(z.object({
  portfolio_id: PortfolioId,
  name: z.string(),
  base_currency: z.literal("USD"),
  role: z.enum(VALID_ROLES),
}));
