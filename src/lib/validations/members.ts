import { z } from "zod";

import { VALID_ROLES } from "@/lib/csv/constants";

export const INVITABLE_ROLES = ["EDITOR", "VIEWER"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const InviteMemberInput = z.object({
  email: z.string().trim().min(1, "El correo es requerido.").email("Ingresa un correo válido."),
  role: z.enum(INVITABLE_ROLES),
});

export type InviteMemberInput = z.infer<typeof InviteMemberInput>;

export const UpdateMemberRoleInput = z.object({
  role: z.enum(VALID_ROLES),
});

export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleInput>;
