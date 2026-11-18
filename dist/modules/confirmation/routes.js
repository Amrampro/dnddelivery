import express, { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { getDatabase } from "../../database/client.js";
import { getAuthService } from "../auth/runtime.js";
import { principal, requireAuthentication, requirePermission, requireCsrf, requireTrustedOrigin, } from "../auth/auth.middleware.js";
import { ConfirmationService } from "./service.js";
import { TrackingService, trackingUnavailable } from "./tracking.js";
import * as v from "./validation.js";
import { registerDevice } from "./devices.js";
let runtime, tracking;
export const getConfirmationService = () => (runtime ??= new ConfirmationService(getDatabase()));
export const getTrackingService = () => (tracking ??= new TrackingService(getDatabase()));
const uuid = (x) => z.uuid().parse(x);
export function createTrackingRouter() {
    const r = Router();
    r.use((_q, s, n) => {
        s.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
        n();
    }, requireTrustedOrigin(env.CORS_ORIGINS));
    const limit = rateLimit({
        windowMs: 900000,
        limit: 90,
        standardHeaders: "draft-8",
        legacyHeaders: false,
    });
    r.use(limit);
    r.post("/status", async (q, s) => s.json(await getTrackingService().publicStatus(v.lookup.parse(q.body), q.ip ?? "unknown")));
    r.post("/lookup", async (q, s) => s
        .status(202)
        .json(await getTrackingService().lookup(v.lookup.parse(q.body), q.ip ?? "unknown")));
    r.post("/verify", async (q, s) => {
        const input = v.trackingVerify.parse(q.body), result = await getTrackingService().verify(input.reference, input.token, q.ip ?? "unknown");
        s.cookie("dnd_tracking", result.session, {
            httpOnly: true,
            secure: env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/api/tracking/" + encodeURIComponent(result.reference),
            maxAge: 86400000,
        });
        s.json({ reference: result.reference });
    });
    const credential = (s) => z
        .string()
        .regex(/^[A-Za-z0-9_-]{43}$/)
        .safeParse(s);
    r.get("/:reference", async (q, s) => {
        const t = credential(q.cookies.dnd_tracking);
        if (!t.success)
            throw trackingUnavailable();
        s.json(await getTrackingService().detail(q.params.reference, t.data));
    });
    r.post("/:reference/code", async (q, s) => {
        const t = credential(q.cookies.dnd_tracking);
        if (!t.success)
            throw trackingUnavailable();
        s.json(await getTrackingService().code(q.params.reference, t.data));
    });
    return r;
}
export function createConfirmationRouter() {
    const r = Router();
    r.use((q, _s, n) => /^\/deliveries\/[a-f0-9-]+\/(confirmation|otp|proofs|complete|otp-exceptions|tracking|communications)(\/|$)/i.test(q.path) ||
        q.path.startsWith("/delivery-evidence/") ||
        q.path.startsWith("/delivery-devices")
        ? n()
        : n("router"));
    r.use((_q, s, n) => {
        s.set("Cache-Control", "no-store");
        n();
    }, requireAuthentication(getAuthService), requireTrustedOrigin(env.CORS_ORIGINS), requirePermission(getAuthService, "workspace.access"));
    const limit = rateLimit({
        windowMs: 3600000,
        limit: 120,
        keyGenerator: (_q, s) => principal(s).user.id,
        standardHeaders: "draft-8",
        legacyHeaders: false,
    });
    r.use((q, s, n) => q.method === "POST"
        ? requireCsrf(getAuthService)(q, s, (e) => (e ? n(e) : limit(q, s, n)))
        : n());
    const c = (s) => ({
        actorId: principal(s).user.id,
        ...s.locals.workspace,
    });
    r.post("/delivery-devices", async (q, s) => {
        const x = z
            .object({
            token: z
                .string()
                .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/)
                .max(255),
            platform: z.enum(["ios", "android"]),
        })
            .strict()
            .parse(q.body), p = principal(s);
        s.json(await registerDevice(getDatabase(), p, x));
    });
    r.post("/delivery-devices/revoke", async (q, s) => {
        const input = z.object({ id: z.uuid() }).strict().parse(q.body);
        await getDatabase().userDevice.updateMany({
            where: { id: input.id, userId: principal(s).user.id },
            data: { revokedAt: new Date() },
        });
        s.json({ revoked: true });
    });
    r.get("/delivery-devices", async (_q, s) => s.json(await getDatabase().userDevice.findMany({
        where: {
            userId: principal(s).user.id,
            sessionFamilyId: principal(s).session.familyId,
            revokedAt: null,
        },
        select: { id: true, platform: true },
        take: 10,
    })));
    r.get("/deliveries/:id/confirmation", async (q, s) => s.json(await getConfirmationService().confirmation(c(s), uuid(q.params.id))));
    r.get("/deliveries/:id/proofs", async (q, s) => s.json(await getConfirmationService().confirmation(c(s), uuid(q.params.id))));
    r.post("/deliveries/:id/otp/verify", async (q, s) => s.json(await getConfirmationService().verifyCode(c(s), uuid(q.params.id), v.verify.parse(q.body))));
    r.post("/deliveries/:id/otp/resend", async (q, s) => s.json(await getConfirmationService().renew(c(s), uuid(q.params.id), v.regenerate.parse(q.body))));
    r.post("/deliveries/:id/proofs", express.raw({
        type: ["image/jpeg", "image/png", "image/webp"],
        limit: "5mb",
        inflate: false,
    }), async (q, s) => s
        .status(201)
        .json(await getConfirmationService().upload(c(s), uuid(q.params.id), v.upload.parse(q.query), q.body, q.get("Content-Type")?.split(";")[0] ?? "")));
    r.post("/deliveries/:id/complete", async (q, s) => s.json(await getConfirmationService().complete(c(s), uuid(q.params.id), v.complete.parse(q.body))));
    r.post("/deliveries/:id/otp-exceptions", async (q, s) => s
        .status(201)
        .json(await getConfirmationService().requestException(c(s), uuid(q.params.id), v.exception.parse(q.body))));
    r.post("/deliveries/:id/otp-exceptions/:exceptionId/decision", async (q, s) => s.json(await getConfirmationService().decideException(c(s), uuid(q.params.id), uuid(q.params.exceptionId), v.exceptionDecision.parse(q.body))));
    r.get("/delivery-evidence/:id/file", async (q, s) => {
        const bytes = await getConfirmationService().file(c(s), uuid(q.params.id));
        s.set({
            "Content-Type": "image/webp",
            "Content-Disposition": "inline; filename=preuve.webp",
            "X-Content-Type-Options": "nosniff",
        });
        s.send(bytes);
    });
    r.get("/delivery-evidence/:id/preview", async (q, s) => s.json({
        mime: "image/webp",
        image: (await getConfirmationService().file(c(s), uuid(q.params.id))).toString("base64"),
    }));
    r.get("/deliveries/:id/communications", async (q, s) => s.json(await getConfirmationService().communications(c(s), uuid(q.params.id))));
    r.post("/deliveries/:id/tracking/renew", async (q, s) => s.json(await getConfirmationService().renewTracking(c(s), uuid(q.params.id), v.regenerate.parse(q.body))));
    return r;
}
