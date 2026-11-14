import { createHash } from "node:crypto";
import { z } from "zod";
export const money = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/)
  .refine((v) => /[1-9]/.test(v), "Montant strictement positif requis.");
export const currency = z.string().regex(/^[A-Z]{3}$/);
export const id = z.uuid();
export const pageQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    size: z.coerce.number().int().min(1).max(50).default(15),
    q: z.string().trim().max(100).default(""),
    status: z
      .enum([
        "PENDING",
        "APPROVED",
        "REJECTED",
        "ACTIVE",
        "EXPIRED",
        "SOON",
        "NONE",
        "SUSPENDED",
        "CANCELLED",
      ])
      .optional(),
    days: z.coerce.number().int().min(1).max(366).default(30),
  })
  .strict();
export type PageQuery = z.infer<typeof pageQuery>;
export const planInput = z
  .object({
    name: z.string().trim().min(3).max(120),
    amount: money,
    currency,
    expectedPriceId: id.nullable(),
    effectiveFrom: z.iso.datetime().optional(),
  })
  .strict();
export const declarationInput = z
  .object({
    amount: money,
    currency,
    method: z.enum([
      "MTN_MOBILE_MONEY",
      "ORANGE_MONEY",
      "BANK_TRANSFER",
      "CASH",
      "OTHER",
    ]),
    externalReference: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .nullable()
      .default(null),
    paidAt: z.iso.datetime(),
    notes: z.string().trim().max(2000).nullable().default(null),
    idempotencyKey: id,
  })
  .strict();
export const decisionInput = z
  .object({ previewToken: z.string().min(100).max(2000) })
  .strict();
export const rejectionInput = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Half-open [start,end), UTC, same wall-clock time, clamp to target month's last day. */
export function nextMonth(start: Date) {
  const end = new Date(start);
  const day = start.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}
export function effectiveStatus(
  s: { status: string; startedAt: Date | null; expiresAt: Date | null } | null,
  now: Date,
) {
  if (!s) return "NONE";
  if (["SUSPENDED", "CANCELLED"].includes(s.status)) return s.status;
  if (s.expiresAt && s.expiresAt <= now) return "EXPIRED";
  if (
    s.status === "ACTIVE" &&
    s.startedAt &&
    s.startedAt <= now &&
    s.expiresAt &&
    s.expiresAt > now
  )
    return "ACTIVE";
  return "PENDING";
}
