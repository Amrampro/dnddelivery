import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { getDatabase } from "../../database/client.js";
import { getAuthService } from "../auth/runtime.js";
import { principal, requireAuthentication, requirePermission, requireCsrf, requireTrustedOrigin, } from "../auth/auth.middleware.js";
import { DeliveryService } from "./service.js";
import * as v from "./validation.js";
let runtime;
export const getDeliveryService = () => (runtime ??= new DeliveryService(getDatabase()));
const uuid = (id) => z.uuid().parse(id);
export function createDeliveryRouter(auth = getAuthService, service = getDeliveryService, origins = env.CORS_ORIGINS) {
    const r = Router();
    r.use((q, _s, n) => ["/deliveries", "/driver/missions", "/driver/handovers"].some((p) => q.path === p || q.path.startsWith(p + "/"))
        ? n()
        : n("router"));
    r.use((_q, s, n) => {
        s.set("Cache-Control", "no-store");
        n();
    }, requireAuthentication(auth), requireTrustedOrigin(origins), requirePermission(auth, "workspace.access"));
    const limit = rateLimit({
        windowMs: 3600000,
        limit: 500,
        keyGenerator: (_q, s) => principal(s).user.id,
        standardHeaders: "draft-8",
        legacyHeaders: false,
    });
    r.use((q, s, n) => q.method === "POST"
        ? requireCsrf(auth)(q, s, (e) => (e ? n(e) : limit(q, s, n)))
        : n());
    const c = (s) => ({
        actorId: principal(s).user.id,
        ...s.locals.workspace,
    });
    r.get("/deliveries/options", async (_q, s) => s.json(await service().options(c(s))));
    r.get("/deliveries/queue", async (q, s) => s.json(await service().queue(c(s), v.query.parse(q.query))));
    r.get("/deliveries/eligible-drivers", async (q, s) => s.json(await service().eligible(c(s), uuid(q.query.agencyId))));
    r.get("/deliveries/notifications", async (_q, s) => s.json(await service().notifications(c(s))));
    r.get("/deliveries/by-order/:orderId", async (q, s) => s.json(await service().byOrder(c(s), uuid(q.params.orderId))));
    r.get("/driver/handovers", async (_q, s) => s.json(await service().handovers(c(s))));
    for (const base of ["/deliveries", "/driver/missions"]) {
        r.get(base, async (q, s) => s.json(await service().list(c(s), v.query.parse(q.query))));
        r.get(`${base}/:id`, async (q, s) => s.json(await service().detail(c(s), uuid(q.params.id))));
        r.get(`${base}/:id/history`, async (q, s) => s.json(await service().history(c(s), uuid(q.params.id), v.query.parse(q.query))));
    }
    r.post("/deliveries", async (q, s) => s.status(201).json(await service().create(c(s), v.create.parse(q.body))));
    for (const action of ["assign", "reassign"])
        r.post(`/deliveries/:id/${action}`, async (q, s) => s.json(await service().assign(c(s), uuid(q.params.id), v.assign.parse(q.body), action === "reassign")));
    for (const action of ["prepare", "retry", "cancel"])
        r.post(`/deliveries/:id/${action}`, async (q, s) => s.json(await service()[action](c(s), uuid(q.params.id), v.action.parse(q.body))));
    r.post("/deliveries/:id/receive", async (q, s) => s.json(await service().receiveAgency(c(s), uuid(q.params.id), v.receive.parse(q.body))));
    r.post("/deliveries/:id/handovers/:handoverId/cancel", async (q, s) => s.json(await service().cancelHandover(c(s), uuid(q.params.id), uuid(q.params.handoverId), v.action.parse(q.body))));
    r.post("/deliveries/:id/transfers", async (q, s) => s.json(await service().createTransfer(c(s), uuid(q.params.id), v.transfer.parse(q.body))));
    const legAction = v.action.extend({
        legVersion: z.number().int().positive(),
    });
    for (const action of ["dispatch", "cancel"])
        r.post(`/deliveries/:id/transfers/:legId/${action}`, async (q, s) => s.json(await service()[action === "dispatch" ? "dispatchTransfer" : "cancelTransfer"](c(s), uuid(q.params.id), uuid(q.params.legId), legAction.parse(q.body))));
    r.post("/deliveries/:id/transfers/:legId/receive", async (q, s) => s.json(await service().receiveTransfer(c(s), uuid(q.params.id), uuid(q.params.legId), v.receive
        .extend({ legVersion: z.number().int().positive() })
        .parse(q.body))));
    r.post("/deliveries/:id/incidents/:incidentId/resolve", async (q, s) => s.json(await service().resolveIncident(c(s), uuid(q.params.id), uuid(q.params.incidentId), v.resolution.parse(q.body))));
    r.post("/deliveries/:id/return", async (q, s) => s.json(await service().requestReturn(c(s), uuid(q.params.id), v.returnRequest.parse(q.body))));
    r.post("/deliveries/:id/return/receive", async (q, s) => s.json(await service().receiveReturn(c(s), uuid(q.params.id), v.receive.parse(q.body))));
    for (const action of ["reintegrate", "shop"])
        r.post(`/deliveries/:id/return/${action}`, async (q, s) => s.json(await service()[action === "shop" ? "returnShop" : "reintegrate"](c(s), uuid(q.params.id), v.action.parse(q.body))));
    for (const base of ["/deliveries", "/driver/missions"]) {
        r.post(`${base}/:id/pickup`, async (q, s) => s.json(await service().pickup(c(s), uuid(q.params.id), v.action.parse(q.body))));
        r.post(`${base}/:id/events`, async (q, s) => s.json(await service().progress(c(s), uuid(q.params.id), v.progress.parse(q.body))));
        r.post(`${base}/:id/attempt`, async (q, s) => s.json(await service().attempt(c(s), uuid(q.params.id), v.attempt.parse(q.body))));
        r.post(`${base}/:id/incident`, async (q, s) => s.json(await service().incident(c(s), uuid(q.params.id), v.incident.parse(q.body))));
    }
    r.post("/driver/handovers/:handoverId/confirm", async (q, s) => {
        const input = v.handover.extend({ deliveryId: z.uuid() }).parse(q.body);
        s.json(await service().confirmHandover(c(s), input.deliveryId, uuid(q.params.handoverId), input));
    });
    return r;
}
