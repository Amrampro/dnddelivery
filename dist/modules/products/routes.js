import express, { Router } from "express";
import path from "node:path";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { getDatabase } from "../../database/client.js";
import { getAuthService } from "../auth/runtime.js";
import { principal, requireAuthentication, requireTrustedOrigin, requireCsrf, } from "../auth/auth.middleware.js";
import { AuthError } from "../auth/errors.js";
import { persistLogo, readPrivateImage } from "../admin/logos.js";
import { ProductService } from "./service.js";
import * as v from "./validation.js";
let runtime;
export const getProductService = () => (runtime ??= new ProductService(getDatabase()));
export const productImageDirectory = () => path.resolve(process.env.PRODUCT_IMAGE_DIR || "storage/product-images");
export function createProductRouter(auth = getAuthService, service = getProductService, origins = env.CORS_ORIGINS) {
    const r = Router();
    r.use((_q, s, n) => {
        s.set("Cache-Control", "no-store");
        n();
    }, requireAuthentication(auth), requireTrustedOrigin(origins));
    const limited = rateLimit({
        windowMs: 3600000,
        limit: 100,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        keyGenerator: (_q, s) => principal(s).user.id,
    });
    r.use((q, s, n) => ["POST", "PATCH", "PUT"].includes(q.method)
        ? requireCsrf(auth)(q, s, (e) => (e ? n(e) : limited(q, s, n)))
        : n());
    async function context(s, write = false) {
        const p = principal(s), profile = await auth().profile(p), w = profile.activeContext;
        if (!w || !["SHOP", "COMPANY", "AGENCY"].includes(w.scope))
            throw new AuthError(403, "CONTEXT_DENIED", "Sélectionnez un environnement autorisé.");
        await auth().requirePermission(p, w.scope === "SHOP"
            ? write
                ? "shop.products.manage"
                : "shop.products.read"
            : "stocks.read");
        if (write && w.scope !== "SHOP")
            throw new AuthError(403, "CATALOG_FORBIDDEN", "Le catalogue appartient à la boutique.");
        return {
            actorId: p.user.id,
            scope: w.scope,
            companyId: w.companyId,
            agencyId: w.agencyId,
            shopId: w.shopId,
        };
    }
    r.get("/", async (q, s) => s.json(await service().list(await context(s), v.query.parse(q.query))));
    r.post("/", async (q, s) => s
        .status(201)
        .json(await service().create(await context(s, true), v.create.parse(q.body))));
    r.get("/:id", async (q, s) => s.json(await service().detail(await context(s), z.uuid().parse(q.params.id))));
    r.patch("/:id", async (q, s) => s.json(await service().update(await context(s, true), z.uuid().parse(q.params.id), v.update.parse(q.body))));
    r.get("/:id/image", async (q, s) => {
        const key = await service().imageKey(await context(s), z.uuid().parse(q.params.id));
        if (!key || !/^[a-f0-9-]{36}\.webp$/.test(key))
            throw new AuthError(404, "IMAGE_NOT_FOUND", "Aucune image associée.");
        try {
            s.json({
                mime: "image/webp",
                image: (await readPrivateImage(productImageDirectory(), key)).toString("base64"),
            });
        }
        catch {
            throw new AuthError(404, "IMAGE_NOT_FOUND", "Image indisponible.");
        }
    });
    r.put("/:id/image", express.raw({
        type: ["image/png", "image/jpeg", "image/webp"],
        limit: "2mb",
        inflate: false,
    }), async (q, s) => {
        const c = await context(s, true), id = z.uuid().parse(q.params.id), n = z.coerce
            .number()
            .int()
            .positive()
            .parse(q.get("X-Product-Version"));
        await persistLogo(q.body, q.get("Content-Type") ?? "", (key) => service().setImage(c, id, n, key), productImageDirectory());
        s.json(await service().detail(c, id));
    });
    return r;
}
