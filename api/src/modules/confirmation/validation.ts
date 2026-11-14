import { z } from "zod";
export const operation = z
  .object({ operationKey: z.string().trim().min(8).max(100) })
  .strict();
export const action = operation
  .extend({ version: z.number().int().min(1) })
  .strict();
export const verify = action
  .extend({ code: z.string().regex(/^\d{6}$/) })
  .strict();
export const reason = z.string().trim().min(5).max(500);
export const regenerate = action.extend({ reason }).strict();
export const exception = action.extend({ reason }).strict();
export const exceptionDecision = action
  .extend({
    exceptionVersion: z.number().int().min(1),
    approve: z.boolean(),
    reason,
  })
  .strict();
export const complete = action
  .extend({
    evidenceIds: z.array(z.uuid()).min(1).max(5),
    exceptionId: z.uuid().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((x) => new Set(x.evidenceIds).size === x.evidenceIds.length);
export const upload = operation
  .extend({ kind: z.enum(["HANDOVER", "FAILURE"]) })
  .strict();
export const lookup = z
  .object({
    reference: z.string().trim().min(3).max(80),
    email: z.email().max(254),
  })
  .strict();
export const trackingVerify = z
  .object({
    reference: z.string().trim().max(80),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
