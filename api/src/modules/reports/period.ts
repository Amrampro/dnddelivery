import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { stockError } from "../stocks/access.js";
export const query = z.object({
  preset: z.enum(["today", "yesterday", "7d", "30d", "month", "previous-month", "week", "custom"]).default("30d"),
  from: z.iso.date().optional(), to: z.iso.date().optional(),
  companyId: z.uuid().optional(), agencyId: z.uuid().optional(), shopId: z.uuid().optional(), courierId: z.uuid().optional(),
  status: z.string().regex(/^[A-Z_]{1,40}$/).optional(), type: z.enum(["ONE_OFF", "FROM_STOCK"]).optional(),
  actorId: z.uuid().optional(), module: z.string().regex(/^[A-Za-z_]{1,80}$/).optional(), action: z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1), size: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type ReportQuery = z.infer<typeof query>;
export function reportPeriod(q: ReportQuery, timezone: string, now = new Date()) {
  try {
    const today = Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(timezone).toPlainDate();
    let from = today, to = today;
    if (q.preset === "custom") {
      if (!q.from || !q.to) throw Error("Both dates required");
      from = Temporal.PlainDate.from(q.from); to = Temporal.PlainDate.from(q.to);
    } else {
      if (q.from || q.to) throw Error("Custom period required");
      if (q.preset === "yesterday") from = to = today.subtract({ days: 1 });
      if (q.preset === "7d") from = today.subtract({ days: 6 });
      if (q.preset === "30d") from = today.subtract({ days: 29 });
      if (q.preset === "week") from = today.subtract({ days: today.dayOfWeek - 1 });
      if (q.preset === "month") from = today.with({ day: 1 });
      if (q.preset === "previous-month") { to = today.with({ day: 1 }).subtract({ days: 1 }); from = to.with({ day: 1 }); }
    }
    const days = from.until(to).days + 1;
    if (days < 1 || days > 366) throw Error("Range limit");
    const midnight = (d: Temporal.PlainDate) => new Date(d.toZonedDateTime(timezone).epochMilliseconds);
    const boundaries = Array.from({ length: days + 1 }, (_, n) => midnight(from.add({ days: n })));
    return { from: from.toString(), to: to.toString(), timezone, start: boundaries[0]!, end: boundaries[days]!, boundaries,
      previous: { start: midnight(from.subtract({ days })), end: midnight(from), from: from.subtract({ days }).toString(), to: from.subtract({ days: 1 }).toString() } };
  } catch {
    throw stockError("REPORT_PERIOD_INVALID", "Période de 1 à 366 jours et fuseau métier valide requis.", 400);
  }
}
