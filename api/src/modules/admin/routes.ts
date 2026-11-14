import express, { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { AuthError } from "../auth/errors.js";
import { getAuthService } from "../auth/runtime.js";
import {
  principal,
  requireAuthentication,
  requireCsrf,
  requirePermission,
  requireTrustedOrigin,
} from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import { env } from "../../config/env.js";
import { getAdminService } from "./runtime.js";
import type { AdminService } from "./service.js";
import { adminController } from "./controller.js";
import { acceptInvitation, inspectInvitation } from "./validation.js";
import { OrganizationService } from "../organization/service.js";
export function createAdminRouter(
  auth: () => AuthService = getAuthService,
  service: () => AdminService = getAdminService,
  origins: readonly string[] = env.CORS_ORIGINS,
) {
  const router = Router(),
    controller = adminController(service);
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(
    requireAuthentication(auth),
    requirePermission(auth, "platform.manage"),
  );
  router.use((_req, res, next) => {
    if (res.locals.workspace.scope !== "GLOBAL")
      return next(
        new AuthError(403, "GLOBAL_REQUIRED", "Un accès global est requis."),
      );
    next();
  });
  router.use(requireTrustedOrigin(origins));
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  const writes = rateLimit({
    windowMs: 3600000,
    limit: 60,
    keyGenerator: (_req, res) => principal(res).user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const invites = rateLimit({
    windowMs: 3600000,
    limit: 10,
    keyGenerator: (_req, res) => principal(res).user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  router.use((req, res, next) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
      ? requireCsrf(auth)(req, res, next)
      : next(),
  );
  router.use((req, res, next) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
      ? writes(req, res, next)
      : next(),
  );
  router.get("/dashboard", controller.dashboard);
  router.get("/invitations", controller.invitations);
  router.get("/companies", controller.list);
  router.post("/companies", controller.create);
  router.get("/companies/:id", controller.detail);
  router.patch("/companies/:id", controller.update);
  router.patch("/companies/:id/status", controller.status);
  router.get("/companies/:id/admins", controller.admins);
  router.post("/companies/:id/admins", controller.associate);
  router.post("/companies/:id/admins/invite", invites, controller.invite);
  router.patch("/companies/:id/admins/:userId", controller.primary);
  router.delete("/companies/:id/admins/:userId", controller.remove);
  router.post("/invitations/:id/resend", invites, controller.resend);
  router.post("/invitations/:id/revoke", controller.revoke);
  router.get("/activity", controller.history);
  router.get("/users/lookup", controller.users);
  router.put(
    "/companies/:id/logo",
    express.raw({
      type: ["image/png", "image/jpeg", "image/webp"],
      limit: "2mb",
      inflate: false,
    }),
    controller.putLogo,
  );
  router.get("/companies/:id/logo", controller.getLogo);
  return router;
}
export function createInvitationRouter(
  service: () => AdminService = getAdminService,
  origins: readonly string[] = env.CORS_ORIGINS,
  authService: () => AuthService = getAuthService,
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(requireTrustedOrigin(origins));
  router.use(
    rateLimit({
      windowMs: 900000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  router.post("/inspect", async (req, res) => {
    res.json(await service().inspect(inspectInvitation.parse(req.body).token));
  });
  router.post(
    "/accept-existing",
    requireAuthentication(authService),
    requireCsrf(authService),
    async (req, res) => {
      const { token } = inspectInvitation.parse(req.body);
      res.json(
        await new OrganizationService(service().db).accept(
          token,
          undefined,
          principal(res).user.id,
        ),
      );
    },
  );
  router.post(
    "/accept",
    rateLimit({
      windowMs: 900000,
      limit: 8,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    async (req, res) => {
      const input = acceptInvitation.parse(req.body);
      res.json(
        await service().accept(input.token, input.fullName, input.password),
      );
    },
  );
  return router;
}
