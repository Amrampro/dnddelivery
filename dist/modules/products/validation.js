import { z } from "zod";
const optional = (max) => z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null)
    .optional();
export const fields = {
    name: z.string().trim().min(2).max(200),
    sku: optional(80),
    description: optional(5000),
    category: optional(160),
    unit: z.string().trim().min(1).max(30).default("piece"),
    active: z.boolean().default(true),
};
export const create = z.object(fields).strict();
export const update = z
    .object({
    name: fields.name.optional(),
    sku: optional(80),
    description: optional(5000),
    category: optional(160),
    unit: z.string().trim().min(1).max(30).optional(),
    active: z.boolean().optional(),
    version: z.number().int().positive(),
})
    .strict()
    .refine((value) => Object.keys(value).some((key) => key !== "version"), "Indiquez une modification.");
export const query = z
    .object({
    q: z.string().trim().max(160).optional(),
    shopId: z.uuid().optional(),
    status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
    page: z.coerce.number().int().positive().max(100000).default(1),
    size: z.coerce.number().int().min(1).max(50).default(20),
})
    .strict();
