import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { getDatabase } from "../../database/client.js";
import { getAuthService } from "../auth/runtime.js";
import { principal, requireAuthentication, requirePermission, requireCsrf, requireTrustedOrigin, } from "../auth/auth.middleware.js";
import { FinancialService } from "./service.js";
import * as v from "./validation.js";
let runtime;
export const getFinancialService = () => (runtime ??= new FinancialService(getDatabase()));
export function createFinancialRouter() {
    const r = Router(), prefixes = [
        "/collections",
        "/driver/collections",
        "/cash-remittances",
        "/driver/cash-remittances",
        "/financial-overview",
        "/financial-obligations",
        "/financial-corrections",
        "/financial-discrepancies",
        "/financial-history",
        "/financial-options",
        "/financial-notifications",
    ];
    r.use((q, _s, n) => prefixes.some((p) => q.path === p || q.path.startsWith(p + "/"))
        ? n()
        : n("router"));
    r.use((_q, s, n) => {
        s.set("Cache-Control", "no-store");
        n();
    }, requireAuthentication(getAuthService), requireTrustedOrigin(env.CORS_ORIGINS), requirePermission(getAuthService, "workspace.access"));
    const limit = rateLimit({
        windowMs: 3600000,
        limit: 300,
        keyGenerator: (_q, s) => principal(s).user.id,
        standardHeaders: "draft-8",
        legacyHeaders: false,
    });
    r.use((q, s, n) => q.method === "POST"
        ? requireCsrf(getAuthService)(q, s, (e) => (e ? n(e) : limit(q, s, n)))
        : n());
    const context = (s) => ({
        actorId: principal(s).user.id,
        ...s.locals.workspace,
    }), id = (x) => z.uuid().parse(x);
    r.get("/financial-options", async (_q, s) => s.json(await getFinancialService().options(context(s))));
    r.get("/financial-overview", async (q, s) => s.json(await getFinancialService().overview(context(s), v.query.parse(q.query))));
    r.get("/financial-obligations", async (q, s) => s.json(await getFinancialService().obligations(context(s), v.query.parse(q.query))));
    r.get("/financial-history", async (q, s) => s.json(await getFinancialService().history(context(s), v.query.parse(q.query))));
    r.get("/financial-notifications", async (_q, s) => s.json(await getFinancialService().notifications(context(s))));
    r.get("/collections", async (q, s) => s.json(await getFinancialService().collections(context(s), v.query.parse(q.query))));
    r.get("/collections/:id", async (q, s) => s.json(await getFinancialService().collection(context(s), id(q.params.id))));
    r.post("/driver/collections", async (q, s) => s
        .status(201)
        .json(await getFinancialService().declare(context(s), v.declaration.parse(q.body))));
    r.get("/cash-remittances", async (q, s) => s.json(await getFinancialService().remittances(context(s), v.query.parse(q.query))));
    r.get("/cash-remittances/:id", async (q, s) => s.json(await getFinancialService().remittance(context(s), id(q.params.id))));
    r.post("/driver/cash-remittances", async (q, s) => s
        .status(201)
        .json(await getFinancialService().createRemittance(context(s), v.remittance.parse(q.body))));
    r.post("/cash-remittances/:id/decision", async (q, s) => s.json(await getFinancialService().decideRemittance(context(s), id(q.params.id), v.decision.parse(q.body))));
    r.get("/financial-corrections", async (q, s) => s.json(await getFinancialService().corrections(context(s), v.query.parse(q.query))));
    r.post("/financial-corrections", async (q, s) => s
        .status(201)
        .json(await getFinancialService().requestCorrection(context(s), v.correction.parse(q.body))));
    r.post("/financial-corrections/:id/decision", async (q, s) => s.json(await getFinancialService().decideCorrection(context(s), id(q.params.id), v.correctionDecision.parse(q.body))));
    r.get("/financial-discrepancies", async (q, s) => s.json(await getFinancialService().discrepancies(context(s), v.query.parse(q.query))));
    r.get("/financial-discrepancies/:id", async (q, s) => s.json(await getFinancialService().discrepancies(context(s), v.query.parse(q.query), id(q.params.id))));
    r.post("/financial-discrepancies", async (q, s) => s
        .status(201)
        .json(await getFinancialService().reportDiscrepancy(context(s), v.discrepancy.parse(q.body))));
    r.post("/financial-discrepancies/:id/resolve", async (q, s) => s.json(await getFinancialService().resolveDiscrepancy(context(s), id(q.params.id), v.resolution.parse(q.body))));
    return r;
}
