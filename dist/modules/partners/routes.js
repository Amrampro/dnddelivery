import express, { Router } from "express";
import { setTimeout as delay } from "node:timers/promises";
import { randomInt } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { getDatabase } from "../../database/client.js";
import { getAuthSettings } from "../../config/auth.js";
import { getAuthService } from "../auth/runtime.js";
import { invitationMailer } from "../auth/smtp.js";
import { principal, requireAuthentication, requireCsrf, requireTrustedOrigin, requirePermission, } from "../auth/auth.middleware.js";
import { AuthError } from "../auth/errors.js";
import { companyLogoDirectory, persistLogo, readPrivateImage } from "../admin/logos.js";
import { PartnerService } from "./service.js";
import * as v from "./validation.js";
let runtime;
export const getPartnerService = () => (runtime ??= new PartnerService(getDatabase(), invitationMailer(), getAuthSettings().webUrl));
const uuid = (value) => z.uuid().parse(value);
export function createPartnerRouter(company = false, auth = getAuthService, service = getPartnerService, origins = env.CORS_ORIGINS) {
    const r = Router();
    r.use((_q, s, n) => {
        s.set("Cache-Control", "no-store");
        n();
    }, requireAuthentication(auth), requireTrustedOrigin(origins));
    const writes = rateLimit({
        windowMs: 3600000,
        limit: 100,
        keyGenerator: (_q, s) => principal(s).user.id,
        standardHeaders: "draft-8",
        legacyHeaders: false,
    });
    const sends = rateLimit({
        windowMs: 3600000,
        limit: 20,
        keyGenerator: (_q, s) => principal(s).user.id,
        standardHeaders: "draft-8",
        legacyHeaders: false,
    });
    r.use((q, s, n) => ["POST", "PUT", "PATCH", "DELETE"].includes(q.method)
        ? requireCsrf(auth)(q, s, (e) => (e ? n(e) : writes(q, s, n)))
        : n());
    const c = (s) => {
        const w = s.locals.workspace;
        return {
            actorId: principal(s).user.id,
            scope: company ? "COMPANY" : "SHOP",
            companyId: w.companyId,
            shopId: w.shopId,
        };
    };
    const access = (permission) => [
        requirePermission(auth, permission),
        (_q, s, n) => {
            if (s.locals.workspace.scope !== (company ? "COMPANY" : "SHOP"))
                return n(new AuthError(403, "SCOPE_DENIED", "Sélectionnez un espace autorisé."));
            n();
        },
    ];
    const read = company ? "partners.read" : "shop.collaborations.read", manage = company ? "partners.manage" : "shop.collaborations.manage";
    async function logo(key) {
        if (!key || !/^[a-f0-9-]{36}\.webp$/.test(key))
            throw new AuthError(404, "LOGO_NOT_FOUND", "Aucun logo associé.");
        try {
            return {
                mime: "image/webp",
                image: (await readPrivateImage(companyLogoDirectory(), key)).toString("base64"),
            };
        }
        catch {
            throw new AuthError(404, "LOGO_NOT_FOUND", "Logo indisponible.");
        }
    }
    if (!company) {
        r.get("/profile", ...access("shop.profile.read"), async (_q, s) => s.json(await service().profile(c(s))));
        r.patch("/profile", ...access("shop.profile.write"), async (q, s) => s.json(await service().updateProfile(c(s), v.profile.parse(q.body))));
        r.get("/profile/logo", ...access("shop.profile.read"), async (_q, s) => {
            await service().profile(c(s));
            const p = await service().db.shop.findUniqueOrThrow({
                where: { id: c(s).shopId },
            });
            s.json(await logo(p.logoKey));
        });
        r.put("/profile/logo", ...access("shop.profile.write"), express.raw({
            type: ["image/png", "image/jpeg", "image/webp"],
            limit: "2mb",
            inflate: false,
        }), async (q, s) => {
            await persistLogo(q.body, q.get("Content-Type") ?? "", (key) => service().setLogo(c(s), key, z.coerce.number().int().positive().parse(q.get("X-Shop-Version"))));
            s.json(await service().profile(c(s)));
        });
        r.get("/users", ...access("shop.users.read"), async (q, s) => s.json(await service().users(c(s), v.query.parse(q.query))));
        r.post("/users/invite", ...access("shop.users.manage"), sends, async (q, s) => s
            .status(201)
            .json(await service().inviteUser(c(s), v.invite.parse(q.body))));
        r.patch("/users/:userId", ...access("shop.users.manage"), async (q, s) => s.json(await service().changeUser(c(s), uuid(q.params.userId), v.member.parse(q.body))));
        r.delete("/users/:userId", ...access("shop.users.manage"), async (q, s) => s.json(await service().removeUser(c(s), uuid(q.params.userId), v.version.parse(q.body))));
        r.get("/invitations", ...access("shop.users.read"), async (q, s) => s.json(await service().invitations(c(s), v.query.parse(q.query))));
        for (const action of ["resend", "revoke"])
            r.post(`/invitations/:id/${action}`, ...access("shop.users.manage"), sends, async (q, s) => s.json(await service().invitationAction(c(s), uuid(q.params.id), action)));
        r.post("/collaborations", ...access(manage), async (q, s) => s
            .status(201)
            .json(await service().request(c(s), v.request.parse(q.body))));
    }
    else {
        r.patch("/partners/:id/agencies", ...access(manage), async (q, s) => s.json(await service().setAgencies(c(s), uuid(q.params.id), z
            .object({
            version: z.number().int().positive(),
            agencyIds: z.array(z.uuid()).max(500),
        })
            .strict()
            .parse(q.body))));
        r.get("/partner-requests", ...access(read), async (q, s) => s.json(await service().collaborations(c(s), v.query.parse(q.query), true)));
        r.get("/partner-invitations", ...access(read), async (q, s) => s.json(await service().invitations(c(s), v.query.parse(q.query))));
        r.post("/partner-invitations", ...access(manage), sends, async (q, s) => s
            .status(201)
            .json(await service().invitePartner(c(s), v.companyInvite.parse(q.body))));
        for (const action of ["resend", "revoke"])
            r.post(`/partner-invitations/:id/${action}`, ...access(manage), sends, async (q, s) => s.json(await service().invitationAction(c(s), uuid(q.params.id), action)));
    }
    const base = company ? "/partners" : "/collaborations";
    r.get(base, ...access(read), async (q, s) => s.json(await service().collaborations(c(s), v.query.parse(q.query))));
    r.get(`${base}/:id`, ...access(read), async (q, s) => s.json(await service().detail(c(s), uuid(q.params.id))));
    r.get(`${base}/:id/${company ? "shop-logo" : "company-logo"}`, ...access(read), async (q, s) => {
        const p = await service().detail(c(s), uuid(q.params.id));
        const key = company
            ? (await service().db.shop.findUniqueOrThrow({
                where: { id: p.shopId },
            })).logoKey
            : (await service().db.company.findUniqueOrThrow({
                where: { id: p.companyId },
            })).logoKey;
        s.json(await logo(key));
    });
    for (const action of [
        "request",
        "accept",
        "reject",
        "suspend",
        "terminate",
    ])
        r.post(`${base}/:id/${action}`, ...access(manage), async (q, s) => s.json(await service().action(c(s), uuid(q.params.id), action, v.version.parse(q.body))));
    r.get(company ? "/partner-directory" : "/directory/companies", ...access(read), async (q, s) => s.json(await service().directory(c(s), z.string().trim().min(1).max(50).parse(q.query.reference))));
    r.get(company ? "/partner-history" : "/history", ...access(company ? read : "shop.history.read"), async (q, s) => s.json(await service().history(c(s), v.query.parse(q.query))));
    r.get(company ? "/partner-notifications" : "/notifications", ...access(company ? read : "shop.notifications.read"), async (q, s) => s.json(await service().notifications(c(s), v.query.parse(q.query))));
    return r;
}
export function createCompanyPartnerRouter(auth = getAuthService, service = getPartnerService, origins = env.CORS_ORIGINS) {
    return createPartnerRouter(true, auth, service, origins);
}
export function createPartnerRegistrationRouter(auth = getAuthService, service = getPartnerService, origins = env.CORS_ORIGINS) {
    const r = Router();
    r.use((_q, s, n) => {
        s.set("Cache-Control", "no-store");
        n();
    }, requireTrustedOrigin(origins), rateLimit({
        limit: 20,
        windowMs: 3600000,
        standardHeaders: "draft-8",
        legacyHeaders: false,
    }));
    r.post("/", async (q, s) => {
        const started = Date.now();
        const result = await service().register(v.registration.parse(q.body), true);
        await delay(Math.max(0, 400 + randomInt(100) - (Date.now() - started)));
        s.status(202).json(result);
    });
    r.post("/inspect", async (q, s) => s.json(await service().inspect(v.token.parse(q.body).token)));
    r.post("/accept", async (q, s) => s.json(await service().accept(v.accept.parse(q.body))));
    r.post("/accept-existing", requireAuthentication(auth), requireCsrf(auth), async (q, s) => s.json(await service().accept(v.accept.parse(q.body), principal(s).user.id)));
    return r;
}
