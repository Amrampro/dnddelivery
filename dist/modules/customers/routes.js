import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { getDatabase } from "../../database/client.js";
import { env } from "../../config/env.js";
import { getAuthService } from "../auth/runtime.js";
import { principal, requireAuthentication, requireCsrf, requireTrustedOrigin, } from "../auth/auth.middleware.js";
import { TrackingService } from "../confirmation/tracking.js";
import { CustomerService, registration, acceptance } from "./service.js";
export function createCustomerRouter() {
    const r = Router(), service = () => new CustomerService(getDatabase());
    r.use((_q, s, n) => {
        s.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
        n();
    }, requireTrustedOrigin(env.CORS_ORIGINS));
    const limit = rateLimit({
        windowMs: 3600000,
        limit: 10,
        standardHeaders: "draft-8",
        legacyHeaders: false,
    });
    r.post("/register", limit, async (q, s) => {
        s.status(202).json(await service().register(registration.parse(q.body)));
    });
    r.post("/verify", limit, async (q, s) => {
        s.json(await service().accept(acceptance.parse(q.body)));
    });
    r.use(requireAuthentication(getAuthService, false));
    r.use(rateLimit({
        windowMs: 900000,
        limit: 120,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        keyGenerator: (_q, s) => principal(s).user.id,
    }));
    r.get("/orders", async (q, s) => s.json(await service().orders(principal(s).user.id, z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .default(1)
        .parse(q.query.page))));
    r.get("/orders/:reference", async (q, s) => {
        s.json(await new TrackingService(getDatabase()).detail(String(q.params.reference), "", principal(s).user.id));
    });
    r.post("/orders/:reference/code", requireCsrf(getAuthService), async (q, s) => {
        s.json(await new TrackingService(getDatabase()).code(String(q.params.reference), "", principal(s).user.id));
    });
    return r;
}
