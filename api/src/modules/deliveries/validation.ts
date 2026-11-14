import { z } from "zod";
export const reason = z.string().trim().min(3).max(500);
export const note = z.string().trim().max(1000).optional();
export const condition = z.enum(["GOOD", "DAMAGED", "REFUSED"]);
export const kind = z.enum([
  "ABSENT",
  "UNREACHABLE",
  "OTP_UNAVAILABLE",
  "ADDRESS_NOT_FOUND",
  "REFUSED",
  "DAMAGED",
  "TRANSPORT",
  "OTHER",
]);
export const action = z
  .object({
    version: z.number().int().positive(),
    operationKey: z.string().trim().min(8).max(100),
    reason: reason.optional(),
    notes: note,
  })
  .strict();
export const create = z
  .object({
    orderId: z.uuid(),
    orderVersion: z.number().int().positive(),
    operationKey: z.string().trim().min(8).max(100),
  })
  .strict();
export const assign = action.extend({ courierId: z.uuid() });
export const handover = action.extend({
  condition,
  handoverVersion: z.number().int().positive(),
});
export const progress = action.extend({
  event: z.enum([
    "DEPARTED",
    "ARRIVED_AGENCY",
    "FINAL_DISTRIBUTION",
    "ARRIVED",
    "RETURN_STARTED",
    "RETURN_ARRIVED",
  ]),
});
export const attempt = action
  .extend({
    result: z.enum(["AWAITING_CONFIRMATION", "FAILED"]),
    kind: kind.optional(),
  })
  .superRefine((v, c) => {
    if (v.result === "FAILED" && (!v.kind || !v.reason))
      c.addIssue({
        code: "custom",
        message: "Un motif structuré et une explication sont requis.",
      });
  });
export const incident = action.extend({
  kind,
  description: z.string().trim().min(3).max(1000),
  blocking: z.boolean().default(false),
});
export const resolution = action.extend({
  incidentVersion: z.number().int().positive(),
  decision: z.enum(["RETRY", "REASSIGN", "RETURN", "NOTE"]),
  courierId: z.uuid().optional(),
  agencyId: z.uuid().optional(),
});
export const transfer = action.extend({
  destinationAgencyId: z.uuid(),
  transporterId: z.uuid(),
});
export const receive = action.extend({
  condition,
  legVersion: z.number().int().positive().optional(),
  restock: z.boolean().default(false),
  returnToOrigin: z.boolean().default(false),
});
export const returnRequest = action.extend({ agencyId: z.uuid() });
export const query = z
  .object({
    page: z.coerce.number().int().positive().max(100000).default(1),
    size: z.coerce.number().int().min(1).max(50).default(20),
    q: z.string().trim().max(160).optional(),
    companyId: z.uuid().optional(),
    agencyId: z.uuid().optional(),
    status: z
      .enum([
        "PENDING",
        "ASSIGNED",
        "IN_PROGRESS",
        "FAILED",
        "DELIVERED",
        "CANCELLED",
      ])
      .optional(),
    phase: z.string().max(40).optional(),
    courierId: z.uuid().optional(),
    history: z.enum(["true", "false"]).optional(),
    incident: z.enum(["open", "all"]).optional(),
    returns: z.enum(["true"]).optional(),
    transfers: z.enum(["true"]).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict();
export type Action = z.infer<typeof action>;
export type Query = z.infer<typeof query>;
