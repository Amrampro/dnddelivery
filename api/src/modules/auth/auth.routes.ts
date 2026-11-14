import { setTimeout as delay } from "node:timers/promises";
import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import type { AuthService } from "./auth.service.js";
import { getAuthService } from "./runtime.js";
import {
  clientType,
  principal,
  requireAuthentication,
  requireCsrf,
  requirePermission,
  requireTrustedOrigin,
} from "./auth.middleware.js";
import {
  loginSchema,
  refreshSchema,
  forgotSchema,
  resetSchema,
  changeSchema,
  profileSchema,
  contextSchema,
} from "./validators.js";
import { unauthorized } from "./errors.js";
import { env } from "../../config/env.js";
export function createAuthRouter(
  service: () => AuthService = getAuthService,
  origins: readonly string[] = env.CORS_ORIGINS,
) {
  const router = Router(),
    auth = requireAuthentication(service, false),
    csrf = requireCsrf(service);
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    next();
  });
  router.use(requireTrustedOrigin(origins));
  const limited = (limit: number, windowMs: number) =>
    rateLimit({
      limit,
      windowMs,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMITED",
          message: "Trop de tentatives. R�essayez plus tard.",
        },
      },
    });
  const accountLimit = rateLimit({
    limit: 20,
    windowMs: 900000,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) =>
      createHash("sha256")
        .update(
          (typeof req.body?.email === "string" ? req.body.email : "")
            .trim()
            .toLowerCase(),
        )
        .digest("hex"),
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Trop de tentatives. R�essayez plus tard.",
      },
    },
  });
  router.use(limited(240, 900000));
  function cookies(
    res: Response,
    bundle: Awaited<ReturnType<AuthService["login"]>>,
  ) {
    const s = service().settings;
    const base = { httpOnly: true, secure: s.secure, sameSite: s.sameSite };
    res.cookie("dnd_access", bundle.accessToken, {
      ...base,
      path: "/api",
      maxAge: s.accessSeconds * 1000,
    });
    res.cookie("dnd_refresh", bundle.refreshToken, {
      ...base,
      path: "/api/auth",
      maxAge: Math.max(0, Date.parse(bundle.refreshExpiresAt) - Date.now()),
    });
  }
  function clear(res: Response) {
    const s = service().settings;
    const base = { httpOnly: true, secure: s.secure, sameSite: s.sameSite };
    res.clearCookie("dnd_access", { ...base, path: "/api" });
    res.clearCookie("dnd_refresh", { ...base, path: "/api/auth" });
  }
  router.post("/login", limited(12, 900000), accountLimit, async (req, res) => {
    const data = loginSchema.parse(req.body);
    const svc = service();
    const bundle = await svc.login(data.email, data.password, {
      client: clientType(req),
      deviceName:
        data.deviceName ??
        (clientType(req) === "WEB" ? "Navigateur Web" : "Application mobile"),
      userAgent: req.get("User-Agent")?.slice(0, 255) ?? null,
      ipHash: null,
    });
    if (clientType(req) === "WEB") {
      cookies(res, bundle);
      res.json({
        user: bundle.user,
        csrfToken: bundle.csrfToken,
        accessExpiresAt: bundle.accessExpiresAt,
      });
    } else res.json(bundle);
  });
  router.get("/csrf", async (req, res) => {
    const raw = req.cookies?.dnd_refresh;
    if (typeof raw !== "string") throw unauthorized();
    const svc = service(),
      session = await svc.inspectRefresh(raw, "WEB");
    const { csrfToken } = await import("./crypto.js");
    res.json({ csrfToken: csrfToken(svc.settings.secret, session.familyId) });
  });
  router.post("/refresh", limited(60, 900000), async (req, res) => {
    const data = refreshSchema.parse(req.body ?? {});
    const raw =
      clientType(req) === "WEB" ? req.cookies?.dnd_refresh : data.refreshToken;
    if (typeof raw !== "string") throw unauthorized();
    const bundle = await service().refresh(
      raw,
      clientType(req),
      req.get("X-CSRF-Token"),
    );
    if (clientType(req) === "WEB") {
      cookies(res, bundle);
      res.json({
        csrfToken: bundle.csrfToken,
        accessExpiresAt: bundle.accessExpiresAt,
      });
    } else res.json(bundle);
  });
  router.post("/logout", async (req, res) => {
    const data = refreshSchema.parse(req.body ?? {});
    const raw =
      clientType(req) === "WEB" ? req.cookies?.dnd_refresh : data.refreshToken;
    if (typeof raw === "string")
      await service().logout(raw, clientType(req), req.get("X-CSRF-Token"));
    if (clientType(req) === "WEB") clear(res);
    res.status(204).end();
  });
  router.post(
    "/forgot-password",
    limited(5, 3600000),
    accountLimit,
    async (req, res) => {
      const started = Date.now(),
        data = forgotSchema.parse(req.body);
      await service().forgotPassword(data.email);
      await delay(Math.max(0, 400 + randomInt(100) - (Date.now() - started)));
      res.status(202).json({
        message:
          "Si un compte correspond, une demande de r�cup�ration a �t� prise en compte.",
      });
    },
  );
  router.post("/reset-password", limited(8, 900000), async (req, res) => {
    const data = resetSchema.parse(req.body);
    await service().resetPassword(data.token, data.password);
    if (clientType(req) === "WEB") clear(res);
    res.json({ message: "Mot de passe modifi�. Reconnectez-vous." });
  });
  router.get("/me", auth, async (_req, res) =>
    res.json(await service().profile(principal(res))),
  );
  router.patch("/me", auth, csrf, async (req, res) =>
    res.json(
      await service().updateProfile(
        principal(res),
        profileSchema.parse(req.body),
      ),
    ),
  );
  router.get("/organizations", auth, async (_req, res) =>
    res.json({
      organizations: (await service().profile(principal(res))).organizations,
    }),
  );
  router.post("/switch-organization", auth, csrf, async (req, res) =>
    res.json(
      await service().switchOrganization(
        principal(res),
        contextSchema.parse(req.body).contextKey,
      ),
    ),
  );
  router.get("/sessions", auth, async (_req, res) =>
    res.json({ sessions: await service().sessions(principal(res)) }),
  );
  router.delete("/sessions/:id", auth, csrf, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await service().revokeSession(principal(res), id);
    if (id === principal(res).session.id && clientType(req) === "WEB")
      clear(res);
    res.status(204).end();
  });
  router.post("/logout-all", auth, csrf, async (req, res) => {
    await service().logoutAll(principal(res));
    if (clientType(req) === "WEB") clear(res);
    res.status(204).end();
  });
  router.post(
    "/change-password",
    auth,
    csrf,
    limited(5, 900000),
    async (req, res) => {
      const data = changeSchema.parse(req.body);
      await service().changePassword(
        principal(res),
        data.currentPassword,
        data.newPassword,
      );
      if (clientType(req) === "WEB") clear(res);
      res.json({
        message: "Mot de passe modifi�. Toutes les sessions ont �t� r�voqu�es.",
      });
    },
  );
  router.get(
    "/workspace",
    auth,
    requirePermission(service, "workspace.access"),
    async (req, res) => {
      const query = z
        .object({
          permission: z
            .string()
            .regex(/^[a-z][a-z0-9_.-]{1,79}$/)
            .optional(),
        })
        .strict()
        .parse(req.query);
      const context = query.permission
        ? await service().requirePermission(principal(res), query.permission)
        : res.locals.workspace;
      res.json({ context });
    },
  );
  return router;
}
