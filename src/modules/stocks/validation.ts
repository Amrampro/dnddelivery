import { z } from "zod";
export const quantity = z.number().int().min(1).max(2147483647);
export const nonnegative = z.number().int().min(0).max(2147483647);
const reference = z.string().trim().min(1).max(60);
const notes = z.string().trim().max(1000).optional();
export const query = z.object({
  q: z.string().trim().max(160).optional(),
  companyId: z.uuid().optional(),
  agencyId: z.uuid().optional(),
  shopId: z.uuid().optional(),
  productId: z.uuid().optional(),
  low: z.enum(["true", "false"]).optional(),
  status: z.string().max(30).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  size: z.coerce.number().int().min(1).max(50).default(20),
});
export const action = z
  .object({
    version: z.number().int().min(0),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
const lines = z
  .array(z.object({ productId: z.uuid(), quantity }).strict())
  .min(1)
  .max(100)
  .refine(
    (a) => new Set(a.map((x) => x.productId)).size === a.length,
    "Un produit ne peut figurer qu’une fois.",
  );
export const deposit = z
  .object({
    reference,
    agencyId: z.uuid(),
    shopId: z.uuid(),
    items: lines,
    notes,
  })
  .strict();
export const withdrawal = z
  .object({
    reference,
    stockId: z.uuid(),
    quantity,
    kind: z.enum(["RETURN", "WITHDRAWAL"]),
    reason: z.string().trim().min(3).max(500),
    recipient: z.string().trim().max(160).optional(),
  })
  .strict();
export const reservation = z
  .object({ reference, stockId: z.uuid(), quantity, notes })
  .strict();
export const transfer = z
  .object({
    reference,
    originAgencyId: z.uuid(),
    destinationAgencyId: z.uuid(),
    shopId: z.uuid(),
    items: lines,
    notes,
  })
  .strict()
  .refine(
    (x) => x.originAgencyId !== x.destinationAgencyId,
    "Choisissez deux agences différentes.",
  );
export const receipt = z
  .object({
    version: z.number().int().positive(),
    items: z
      .array(z.object({ itemId: z.uuid(), quantity }).strict())
      .min(1)
      .max(100),
    notes,
  })
  .strict()
  .refine(
    (x) => new Set(x.items.map((i) => i.itemId)).size === x.items.length,
    "Ligne reçue en double.",
  );
export const incident = z
  .object({
    version: z.number().int().positive(),
    itemId: z.uuid(),
    quantity,
    kind: z.enum(["MISSING", "DAMAGED", "REFUSED", "OTHER"]),
    description: z.string().trim().min(3).max(1000),
  })
  .strict();
export const resolution = z
  .object({
    version: z.number().int().positive(),
    action: z.enum([
      "RECOVER_TO_DESTINATION",
      "RETURN_TO_ORIGIN",
      "CONFIRM_LOSS",
    ]),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const inventory = z
  .object({ reference, agencyId: z.uuid(), shopId: z.uuid().optional(), notes })
  .strict();
export const count = z
  .object({
    version: z.number().int().positive(),
    items: z
      .array(
        z
          .object({
            itemId: z.uuid(),
            countedQuantity: nonnegative,
            reason: z.string().trim().max(500).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .refine(
    (x) => new Set(x.items.map((i) => i.itemId)).size === x.items.length,
    "Ligne comptée en double.",
  );
export const threshold = z
  .object({ version: z.number().int().min(0), alertThreshold: nonnegative })
  .strict();
