import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";
import { getDatabase } from "../../database/client.js";
import { getAuthSettings } from "../../config/auth.js";
import { getAuthService } from "../auth/runtime.js";
import { principal, requireAuthentication, requirePermission, requireTrustedOrigin, requireCsrf, } from "../auth/auth.middleware.js";
import { AuthError } from "../auth/errors.js";
import { SubscriptionService } from "./service.js";
import { SubscriptionRepository } from "./repository.js";
import { pageQuery, planInput, declarationInput, decisionInput, rejectionInput, id, } from "./rules.js";
let runtime;
export const getSubscriptionService = () => (runtime ??= new SubscriptionService(getDatabase(), getAuthSettings().secret));
export function createSubscriptionRouter(global, auth = getAuthService, service = getSubscriptionService, origins = env.CORS_ORIGINS) {
    const r = Router();
    r.use((q, _s, n) => (global
        ? !/^\/(subscriptions(?:\/|$)|subscription-plan(?:\/|$)|subscription-payments(?:\/|$)|subscription-history(?:\/|$))/.test(q.path)
        : !/^\/subscription(?:\/|$)/.test(q.path))
        ? n("router")
        : n());
    r.use((_q, s, n) => {
        s.set("Cache-Control", "no-store");
        n();
    }, requireAuthentication(auth), requirePermission(auth, global ? "subscriptions.validate" : "subscriptions.read"), requireTrustedOrigin(origins));
    r.use((_q, s, n) => {
        const c = s.locals.workspace;
        if (global ? c.scope !== "GLOBAL" : c.scope !== "COMPANY")
            return n(new AuthError(403, "SCOPE_DENIED", "Contexte non autorisé."));
        n();
    });
    const writes = rateLimit({
        windowMs: 3600000,
        limit: 60,
        keyGenerator: (_q, s) => principal(s).user.id,
        standardHeaders: "draft-8",
        legacyHeaders: false,
    });
    r.use((q, s, n) => ["POST", "PATCH", "PUT", "DELETE"].includes(q.method)
        ? requireCsrf(auth)(q, s, (e) => (e ? n(e) : writes(q, s, n)))
        : n());
    const repo = () => new SubscriptionRepository(service().db, service().clock);
    if (global) {
        r.get("/subscriptions/notifications", async (q, s) => s.json(await repo().notifications(pageQuery.parse(q.query))));
        r.get("/subscriptions/overview", async (q, s) => s.json(await repo().overview(pageQuery.parse(q.query).days)));
        r.get("/subscriptions", async (q, s) => s.json(await repo().subscriptions(pageQuery.parse(q.query))));
        r.get("/subscription-plan", async (_q, s) => s.json(await service().plan()));
        r.patch("/subscription-plan", async (q, s) => s.json(await service().updatePlan(principal(s).user.id, planInput.parse(q.body))));
        r.get("/subscription-payments", async (q, s) => s.json(await repo().payments(pageQuery.parse(q.query))));
        r.get("/subscription-history", async (q, s) => s.json(await repo().periods(pageQuery.parse(q.query))));
        r.get("/subscription-payments/:id", async (q, s) => {
            const p = await repo().detail(id.parse(q.params.id));
            if (!p)
                throw new AuthError(404, "PAYMENT_NOT_FOUND", "Déclaration introuvable.");
            s.json(p);
        });
        r.get("/subscription-payments/:id/preview", async (q, s) => s.json(await service().preview(id.parse(q.params.id))));
        r.post("/subscription-payments/:id/approve", async (q, s) => s.json(await service().approve(principal(s).user.id, id.parse(q.params.id), decisionInput.parse(q.body).previewToken)));
        r.post("/subscription-payments/:id/reject", async (q, s) => s.json(await service().reject(principal(s).user.id, id.parse(q.params.id), rejectionInput.parse(q.body).reason)));
    }
    else {
        r.get("/subscription", async (_q, s) => s.json(await service().company(s.locals.workspace.companyId)));
        r.get("/subscription/payments", async (q, s) => s.json(await repo().payments(pageQuery.parse(q.query), s.locals.workspace.companyId)));
        r.post("/subscription/payments", requirePermission(auth, "subscriptions.declare"), async (q, s) => s
            .status(201)
            .json(await service().declare(principal(s).user.id, s.locals.workspace.companyId, declarationInput.parse(q.body))));
        r.get("/subscription/payments/:id", async (q, s) => {
            const p = await repo().detail(id.parse(q.params.id), s.locals.workspace.companyId);
            if (!p)
                throw new AuthError(404, "PAYMENT_NOT_FOUND", "Déclaration introuvable.");
            s.json(p);
        });
        r.get("/subscription/history", async (q, s) => s.json(await repo().periods(pageQuery.parse(q.query), s.locals.workspace.companyId)));
    }
    return r;
}
