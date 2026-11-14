import { z } from "zod";
const text = (n) => z.string().trim().min(1).max(n);
const optional = (n) => z.string().trim().max(n).optional();
export const money = z
    .string()
    .regex(/^\d{1,15}(\.\d{1,4})?$/, "Montant exact attendu, avec un point décimal et au plus quatre décimales.");
export const recipient = z
    .object({
    name: text(160),
    email: z.email().max(254),
    phone: z
        .string()
        .trim()
        .transform((s) => s.replace(/[ ().-]/g, ""))
        .pipe(z
        .string()
        .regex(/^\+[1-9]\d{6,14}$/, "Téléphone international attendu, par exemple +32470123456.")),
    country: text(120),
    city: text(120),
    address: text(500),
    district: optional(160),
    landmark: optional(300),
    accessInstructions: optional(1000),
    desiredDeliveryAt: z.iso
        .datetime({ offset: true })
        .transform((s) => new Date(s).toISOString())
        .optional(),
    observations: optional(1000),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
})
    .strict();
export const line = z
    .object({
    productId: z.uuid().optional(),
    name: text(200),
    sku: optional(80),
    description: optional(1000),
    instructions: optional(1000),
    quantity: z.number().int().min(1).max(2147483647),
    declaredValue: money.optional(),
})
    .strict();
export const content = z
    .object({
    companyId: z.uuid(),
    shopId: z.uuid(),
    agencyId: z.uuid(),
    type: z.enum(["ONE_OFF", "FROM_STOCK"]),
    recipient,
    recipientId: z.uuid().optional(),
    saveRecipient: z.boolean().default(false),
    items: z.array(line).min(1).max(100),
    pickup: z
        .object({
        address: text(500),
        contact: text(160),
        phone: recipient.shape.phone,
        instructions: optional(1000),
    })
        .strict()
        .optional(),
    parcelDescription: text(2000),
    collectionRequired: z.boolean(),
    amountToCollect: money,
    currency: z.string().regex(/^[A-Z]{3}$/),
    financialNotes: optional(1000),
    notes: optional(2000),
})
    .strict()
    .superRefine((x, c) => {
    if ((x.collectionRequired && Number(x.amountToCollect) <= 0) ||
        (!x.collectionRequired && Number(x.amountToCollect) !== 0))
        c.addIssue({
            code: "custom",
            path: ["amountToCollect"],
            message: "Montant positif si encaissement requis, zéro sinon.",
        });
    if (x.type === "ONE_OFF" && !x.pickup)
        c.addIssue({
            code: "custom",
            path: ["pickup"],
            message: "Adresse et contact de collecte requis.",
        });
    if (x.type === "FROM_STOCK" &&
        (x.items.some((i) => !i.productId) ||
            new Set(x.items.map((i) => i.productId)).size !== x.items.length))
        c.addIssue({
            code: "custom",
            path: ["items"],
            message: "Choisissez des produits distincts du catalogue.",
        });
});
export const creation = content.safeExtend({
    clientKey: text(100),
    draft: z.boolean().default(false),
});
export const edit = content.safeExtend({
    version: z.number().int().positive(),
});
export const action = z
    .object({ version: z.number().int().positive(), reason: optional(1000) })
    .strict();
export const query = z
    .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    size: z.coerce.number().int().min(1).max(50).default(20),
    q: optional(160),
    companyId: z.uuid().optional(),
    shopId: z.uuid().optional(),
    agencyId: z.uuid().optional(),
    status: z
        .enum([
        "PENDING",
        "CONFIRMED",
        "PREPARING",
        "READY",
        "IN_DELIVERY",
        "DELIVERED",
        "FAILED",
        "CANCELLED",
        "RETURNED",
    ])
        .optional(),
    type: z.enum(["ONE_OFF", "FROM_STOCK"]).optional(),
    draft: z.enum(["true", "false"]).optional(),
    collectionRequired: z.enum(["true", "false"]).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    sort: z.enum(["newest", "oldest"]).default("newest"),
})
    .strict();
