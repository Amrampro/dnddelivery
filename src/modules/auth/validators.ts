import { z } from "zod";
export const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
export const password = z
  .string()
  .min(12, "Utilisez au moins 12 caractères.")
  .max(128, "Utilisez au maximum 128 caractères.");
export const loginSchema = z
  .object({
    email: z.string().trim().pipe(email),
    password: z.string().min(1).max(128),
    deviceName: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export const refreshSchema = z
  .object({
    refreshToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
  })
  .strict();
export const forgotSchema = z
  .object({ email: z.string().trim().pipe(email) })
  .strict();
export const resetSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password })
  .strict();
export const changeSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  })
  .strict();
export const profileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160),
    phone: z.string().trim().max(32).nullable(),
  })
  .strict();
export const contextSchema = z
  .object({ contextKey: z.string().min(1).max(160) })
  .strict();
