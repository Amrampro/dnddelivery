import { z } from "zod";
import { tenantFilter, } from "../authorization/tenant-access.js";
const period = z
    .object({ from: z.date(), until: z.date() })
    .refine((p) => p.until > p.from);
export function reportScope(context, input) {
    const window = period.parse(input);
    return {
        ...tenantFilter(context, "reports.read"),
        createdAt: { gte: window.from, lt: window.until },
    };
}
