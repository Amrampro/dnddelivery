import { z } from "zod";
export const money = z
    .string()
    .regex(/^\d{1,15}(\.\d{1,4})?$/, "Montant exact attendu, avec un point et au plus quatre décimales.");
export const remittanceStatus = z.enum([
    "DECLARED",
    "CONFIRMED",
    "DISPUTED",
    "CANCELLED",
]);
export const correctionStatus = z.enum(["PENDING", "APPROVED", "REJECTED"]);
const reason = z.string().trim().min(3).max(1000), notes = z.string().trim().max(1000).optional();
export const operation = z
    .object({ operationKey: z.string().trim().min(8).max(100) })
    .strict();
export const action = operation.extend({
    version: z.number().int().min(1),
    reason,
});
export const declaration = operation
    .extend({
    deliveryId: z.uuid(),
    deliveryVersion: z.number().int().min(1),
    amount: money,
    method: z.enum([
        "CASH",
        "MTN_MOBILE_MONEY",
        "ORANGE_MONEY",
        "BANK_TRANSFER",
        "OTHER",
    ]),
    notes,
    reason: reason.optional(),
})
    .strict();
export const remittance = operation
    .extend({
    agencyId: z.uuid(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    items: z
        .array(z.object({ collectionId: z.uuid(), amount: money }).strict())
        .min(1)
        .max(100),
    notes,
})
    .strict()
    .refine((x) => new Set(x.items.map((i) => i.collectionId)).size === x.items.length, "Sélectionnez chaque encaissement une seule fois.");
export const decision = action
    .extend({
    decision: z.enum(["CONFIRM", "DISPUTE", "REJECT", "REQUEST_CORRECTION"]),
    items: z
        .array(z.object({ id: z.uuid(), confirmedAmount: money }).strict())
        .max(100)
        .default([]),
})
    .strict();
export const correction = operation
    .extend({
    kind: z.enum([
        "COLLECTION",
        "REFUND",
        "AGENCY_REFUND",
        "EXPECTED",
        "RECEIPT",
        "EXCEPTION",
    ]),
    deliveryId: z.uuid().optional(),
    collectionId: z.uuid().optional(),
    remittanceItemId: z.uuid().optional(),
    amount: money,
    reason,
    externalReference: z.string().trim().max(160).optional(),
})
    .strict();
export const correctionDecision = action
    .extend({ approve: z.boolean() })
    .strict();
export const discrepancy = operation
    .extend({
    collectionId: z.uuid().optional(),
    remittanceId: z.uuid().optional(),
    kind: z.enum([
        "PARTIAL",
        "ZERO",
        "OVER_COLLECTION",
        "SHORT_REMITTANCE",
        "EXCESS_REMITTANCE",
        "CONTESTED",
        "INPUT_ERROR",
        "MISSING_FUNDS",
        "OTHER",
    ]),
    amount: money,
    description: reason,
})
    .strict()
    .refine((x) => !!x.collectionId !== !!x.remittanceId, "Choisissez un encaissement ou une remise.");
export const resolution = action
    .extend({ status: z.enum(["REVIEW", "RESOLVED", "CLOSED"]) })
    .strict();
export const query = z
    .object({
    orderId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    size: z.coerce.number().int().min(1).max(50).default(20),
    q: z.string().trim().max(160).optional(),
    companyId: z.uuid().optional(),
    agencyId: z.uuid().optional(),
    courierId: z.uuid().optional(),
    shopId: z.uuid().optional(),
    currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .optional(),
    status: z.string().max(32).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
})
    .strict();
