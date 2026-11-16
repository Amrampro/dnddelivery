import { z } from "zod";
export const idSchema = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) => text(max).nullable().optional();
export const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
export const versionSchema = z
  .object({ version: z.number().int().positive() })
  .strict();
export const companyFields = z
  .object({
    name: text(160),
    reference: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z0-9][A-Z0-9_-]{1,49}$/,
        "Référence : 2 à 50 lettres, chiffres, tirets ou underscores.",
      ),
    email,
    phone: text(32),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/, "Code pays ISO à deux lettres requis."),
    city: text(120),
    address: text(500),
    tradeName: optional(160),
    registrationNumber: optional(100),
    description: optional(2000),
  })
  .strict();
export const adminChoice = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), userId: idSchema }).strict(),
  z.object({ mode: z.literal("invite"), email, fullName: text(160) }).strict(),
]);
export const createCompany = companyFields
  .extend({
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
    administrator: adminChoice,
  })
  .strict();
export const updateCompany = companyFields
  .omit({ reference: true })
  .extend({ version: z.number().int().positive() })
  .strict();
export const statusChange = versionSchema
  .extend({
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
    reason: text(500),
  })
  .strict();
export const associateAdmin = versionSchema
  .extend({ userId: idSchema, primary: z.boolean().default(false) })
  .strict();
export const inviteAdmin = versionSchema
  .extend({ email, fullName: text(160), primary: z.boolean().default(false) })
  .strict();
export const primaryAdmin = versionSchema
  .extend({ primary: z.literal(true) })
  .strict();
export const listQuery = z
  .object({
    q: z.string().trim().max(160).default(""),
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "ARCHIVED"]).optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    city: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(15),
    sort: z.enum(["newest", "oldest"]).default("newest"),
  })
  .strict();
export const periodQuery = z
  .object({ days: z.coerce.number().int().min(7).max(90).default(30) })
  .strict();
export const auditQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(15),
    companyId: idSchema.optional(),
  })
  .strict();
export const inspectInvitation = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export const acceptInvitation = inspectInvitation
  .extend({ fullName: text(160), password: z.string().min(12).max(128) })
  .strict();
export type CreateCompany = z.infer<typeof createCompany>;
export type UpdateCompany = z.infer<typeof updateCompany>;
export type ListQuery = z.infer<typeof listQuery>;
