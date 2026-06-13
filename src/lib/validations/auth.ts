import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Ingresa un correo electrónico.")
  .email("Ingresa un correo electrónico válido.")
  .max(254);

export type EmailInput = z.infer<typeof emailSchema>;
