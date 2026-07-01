import type { PortfolioRole } from "@/lib/csv/constants";

export type Member = {
  user_id: string;
  role: PortfolioRole;
  email: string | null;
  created_at: string;
  is_self?: boolean;
};

const ROLE_LABEL: Record<PortfolioRole, string> = {
  OWNER: "Propietario",
  EDITOR: "Editor",
  VIEWER: "Visualizador",
};

export function getRoleLabel(role: PortfolioRole): string {
  return ROLE_LABEL[role];
}
