import { z } from "zod";
const optional = (max) => z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);
export const profileFields = {
    name: z.string().trim().min(2).max(160),
    legalName: optional(160),
    description: optional(2000),
    email: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
    phone: z.string().trim().min(5).max(32),
    address: z.string().trim().min(3).max(500),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    city: z.string().trim().min(2).max(120),
    district: z.string().trim().max(120),
};
export const profile = z
    .object({ version: z.number().int().positive(), ...profileFields })
    .strict();
export const registration = z
    .object({
    ...profileFields,
    fullName: z.string().trim().min(2).max(160),
    termsAccepted: z.literal(true),
    website: z.literal("").default(""),
})
    .strict();
export const query = z.object({
    q: z.string().trim().max(160).optional(),
    direction: z.enum(["received", "sent"]).optional(),
    status: z
        .enum(["PENDING", "ACTIVE", "REJECTED", "SUSPENDED", "ENDED"])
        .optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    size: z.coerce.number().int().min(1).max(50).default(20),
});
export const role = z.enum(["shop_owner", "shop_manager", "shop_employee"]);
export const invite = z
    .object({
    email: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
    fullName: z.string().trim().min(2).max(160),
    role,
})
    .strict();
export const member = z
    .object({ version: z.number().int().positive(), role, active: z.boolean() })
    .strict();
export const version = z
    .object({
    version: z.number().int().positive(),
    reason: z.string().trim().max(500).optional(),
})
    .strict();
export const companyInvite = z
    .object({
    shopReference: z.string().trim().min(1).max(50).optional(),
    email: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase())
        .optional(),
    shopName: z.string().trim().min(2).max(160).optional(),
    observations: z.string().trim().max(1000).optional(),
    agencyIds: z.array(z.uuid()).max(100).optional(),
})
    .strict()
    .refine((v) => !!v.shopReference !== !!v.email, "Indiquez une référence de boutique ou une adresse électronique.");
export const request = z
    .object({
    companyReference: z.string().trim().min(1).max(50),
    observations: z.string().trim().max(1000).optional(),
})
    .strict();
export const token = z.object({ token: z.string().min(32).max(300) }).strict();
export const accept = z
    .object({
    token: z.string().min(32).max(300),
    fullName: z.string().trim().min(2).max(160).optional(),
    password: z.string().min(12).max(128).optional(),
    profile: z.object(profileFields).strict().optional(),
    termsAccepted: z.literal(true),
})
    .strict();
