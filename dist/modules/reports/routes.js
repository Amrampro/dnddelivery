import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { getDatabase } from "../../database/client.js";
import { env } from "../../config/env.js";
import { getAuthService } from "../auth/runtime.js";
import { principal, requireAuthentication, requireCsrf, requirePermission, requireTrustedOrigin } from "../auth/auth.middleware.js";
import { ReportService } from "./service.js";
import { reportKinds } from "./contracts.js";
import { query } from "./period.js";
import { encodeExport } from "./exports.js";
let runtime;
export const getReportService = () => runtime ??= new ReportService(getDatabase());
export function createReportRouter(auth = getAuthService, service = getReportService, origins = env.CORS_ORIGINS) {
    const r = Router();
    r.use((_q, s, n) => { s.set("Cache-Control", "no-store"); n(); }, requireAuthentication(auth), requireTrustedOrigin(origins), requirePermission(auth, "workspace.access"));
    r.use(rateLimit({ windowMs: 60000, limit: 60, keyGenerator: (_q, s) => principal(s).user.id, standardHeaders: "draft-8", legacyHeaders: false }));
    const context = (s) => ({ actorId: principal(s).user.id, ...s.locals.workspace });
    r.get("/options", async (_q, s) => s.json(await service().options(context(s))));
    r.post("/exports", requireCsrf(auth), rateLimit({ windowMs: 60000, limit: 6, keyGenerator: (_q, s) => principal(s).user.id, standardHeaders: "draft-8", legacyHeaders: false }), async (q, s) => {
        const input = z.object({ kind: z.enum(reportKinds), format: z.enum(["csv", "xlsx", "pdf"]), filters: query }).strict().parse(q.body);
        const c = context(s), report = await service().run(c, input.kind, { ...input.filters, page: 1, size: 100 }), output = await encodeExport(report, input.format);
        await service().db.auditLog.create({ data: { actorId: c.actorId, ...(c.scope !== "GLOBAL" && c.companyId ? { companyId: c.companyId } : {}), ...(c.agencyId ? { agencyId: c.agencyId } : {}), action: "REPORT_EXPORTED", entityType: "Report", entityId: input.kind, metadata: { format: input.format, from: report.period.from, to: report.period.to } } });
        // Base64 travels through existing JSON/session clients without an unauthenticated download URL.
        s.json({ filename: `dnd-${input.kind}-${report.period.from}.${input.format}`, mime: output.mime, base64: output.bytes.toString("base64") });
    });
    for (const kind of reportKinds)
        r.get("/" + kind, async (q, s) => s.json(await service().run(context(s), kind, query.parse(q.query))));
    return r;
}
