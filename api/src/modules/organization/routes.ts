import express, { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";
import { getDatabase } from "../../database/client.js";
import { getAuthService } from "../auth/runtime.js";
import { getAdminService } from "../admin/runtime.js";
import type { AuthService } from "../auth/auth.service.js";
import {
  principal,
  requireAuthentication,
  requirePermission,
  requireCsrf,
  requireTrustedOrigin,
} from "../auth/auth.middleware.js";
import { AuthError } from "../auth/errors.js";
import { organizationController } from "./controller.js";
import { OrganizationService } from "./service.js";
let runtime: OrganizationService | undefined;
export const getOrganizationService = () =>
  (runtime ??= new OrganizationService(getDatabase(), getAdminService()));
export function createOrganizationRouter(
  global = false,
  driver = false,
  auth: () => AuthService = getAuthService,
  service: () => OrganizationService = getOrganizationService,
  origins: readonly string[] = env.CORS_ORIGINS,
) {
  const r = Router({ mergeParams: true }),
    c = organizationController(service, global);
  r.use(
    (_q, s, n) => {
      s.set("Cache-Control", "no-store");
      n();
    },
    requireAuthentication(auth),
    requireTrustedOrigin(origins),
  );
  const writes = rateLimit({
    windowMs: 3600000,
    limit: 100,
    keyGenerator: (_q, s) => principal(s).user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const invitationSends = rateLimit({
    windowMs: 3600000,
    limit: 20,
    keyGenerator: (_q, s) => principal(s).user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  r.use((q, s, n) =>
    ["POST", "PATCH", "PUT", "DELETE"].includes(q.method)
      ? requireCsrf(auth)(q, s, (e) => (e ? n(e) : writes(q, s, n)))
      : n(),
  );
  const access = (permission: string) => [
    requirePermission(auth, global ? "platform.manage" : permission),
    c.access(permission),
    (_q: express.Request, s: express.Response, n: express.NextFunction) => {
      if (
        global
          ? s.locals.workspace.scope !== "GLOBAL"
          : !["COMPANY", "AGENCY"].includes(s.locals.workspace.scope)
      )
        return n(new AuthError(403, "SCOPE_DENIED", "Contexte non autorisé."));
      n();
    },
  ];
  if (driver) {
    r.get("/profile", ...access("drivers.self.read"), c.driverSelf);
    r.get("/availability", ...access("drivers.self.read"), c.driverSelf);
    r.patch(
      "/availability",
      ...access("drivers.availability.write"),
      c.availability,
    );
    return r;
  }
  r.get("/profile", ...access("company.profile.read"), c.profile);
  r.patch("/profile", ...access("company.profile.write"), c.updateProfile);
  r.get("/profile/logo", ...access("company.profile.read"), c.logo);
  r.put(
    "/profile/logo",
    ...access("company.profile.write"),
    express.raw({
      type: ["image/png", "image/jpeg", "image/webp"],
      limit: "2mb",
      inflate: false,
    }),
    c.putLogo,
  );
  r.get("/agencies", ...access("agencies.read"), c.agencies);
  r.post("/agencies", ...access("agencies.create"), c.createAgency);
  r.get("/agencies/:id", ...access("agencies.read"), c.agency);
  r.patch("/agencies/:id", ...access("agencies.update"), c.updateAgency);
  r.patch("/agencies/:id/status", ...access("agencies.status"), c.agencyStatus);
  r.patch("/agencies/:id/primary", ...access("agencies.update"), c.primary);
  r.get("/employees", ...access("employees.read"), c.employees);
  r.post(
    "/employees/invite",
    ...access("employees.invite"),
    invitationSends,
    c.invite,
  );
  r.get("/employees/:id", ...access("employees.read"), c.employee);
  r.patch("/employees/:id", ...access("employees.manage"), c.updateEmployee);
  r.delete(
    "/employees/:id/affiliation",
    ...access("employees.remove"),
    c.removeEmployee,
  );
  r.get("/drivers", ...access("drivers.read"), c.drivers);
  r.get("/drivers/:id", ...access("drivers.read"), c.driver);
  r.patch("/drivers/:id", ...access("drivers.manage"), c.updateDriver);
  r.patch(
    "/drivers/:id/assignments",
    ...access("employees.manage"),
    c.updateEmployee,
  );
  r.get(
    "/staff-invitations",
    ...access("employees.read"),
    (_q, s, n) =>
      s.locals.workspace.scope === "AGENCY"
        ? n(new AuthError(403, "SCOPE_DENIED", "Accès entreprise requis."))
        : n(),
    c.invitations,
  );
  r.post(
    "/staff-invitations/:id/resend",
    ...access("employees.invite"),
    invitationSends,
    c.invitationAction("resend"),
  );
  r.post(
    "/staff-invitations/:id/revoke",
    ...access("employees.invite"),
    c.invitationAction("revoke"),
  );
  r.get(
    "/organization/history",
    ...access("organization.audit.read"),
    c.history,
  );
  r.get("/organization/self", ...access("organization.self.read"), c.self);
  return r;
}
