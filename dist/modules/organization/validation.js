import { z } from "zod";
import { staffRoles } from "./permissions.js";
export const id = z.uuid(), version = z.number().int().positive();
const text = (max) => z.string().trim().min(1).max(max);
const optional = (max) => z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .default(null);
const email = z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase());
export const profileInput = z
    .object({
    version,
    tradeName: optional(160),
    address: text(500),
    phone: text(32),
    email,
    city: text(120),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    description: optional(2000),
})
    .strict();
export const agencyFields = z
    .object({
    reference: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9][A-Z0-9_-]{1,49}$/),
    name: text(160),
    phone: text(32),
    email: email.nullable().default(null),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    city: text(120),
    zone: optional(120),
    address: text(500),
    locationNotes: optional(1000),
})
    .strict();
export const agencyUpdate = agencyFields.extend({ version }).strict();
export const agencyStatus = z
    .object({
    version,
    status: z.enum(["ACTIVE", "INACTIVE"]),
    reason: text(500),
})
    .strict();
export const primaryInput = z
    .object({ version, userId: id.nullable() })
    .strict();
export const staffInput = z
    .object({
    role: z.enum(staffRoles),
    agencyIds: z
        .array(id)
        .max(100)
        .refine((a) => new Set(a).size === a.length, "Agence répétée.")
        .default([]),
})
    .strict()
    .refine((v) => v.role === "employee" || v.agencyIds.length > 0, "Sélectionnez au moins une agence.");
export const inviteInput = z
    .object({
    email,
    fullName: text(160),
    role: z.enum(staffRoles),
    agencyIds: z.array(id).max(100).default([]),
})
    .strict()
    .refine((v) => v.role === "employee" || v.agencyIds.length > 0, "Sélectionnez au moins une agence.");
export const employeeInput = z
    .object({
    version,
    role: z.enum(staffRoles),
    agencyIds: z.array(id).max(100),
    status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]),
})
    .strict()
    .refine((v) => v.role === "employee" || v.agencyIds.length > 0, "Sélectionnez au moins une agence.");
export const removalInput = z.object({ version, reason: text(500) }).strict();
export const driverInput = z
    .object({
    version,
    employeeNumber: optional(50),
    status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]),
    transport: z
        .enum(["MOTORBIKE", "BICYCLE", "CAR", "VAN", "OTHER"])
        .nullable()
        .default(null),
    notes: optional(2000),
})
    .strict();
export const availabilityInput = z
    .object({ version, availability: z.enum(["AVAILABLE", "UNAVAILABLE"]) })
    .strict();
export const query = z
    .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    size: z.coerce.number().int().min(1).max(50).default(15),
    q: z.string().trim().max(160).default(""),
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
    role: z.enum([...staffRoles, "company_admin"]).optional(),
    agencyId: id.optional(),
})
    .strict();
