import type { Request, Response } from "express";
import { principal } from "../auth/auth.middleware.js";
import type { OrganizationService } from "./service.js";
import type { OrganizationContext } from "./access.js";
import { authorizeOrganization, checkVersion } from "./access.js";
import * as v from "./validation.js";
import { getLogo, persistLogo } from "../admin/logos.js";
import { AuthError } from "../auth/errors.js";
export function organizationController(
  service: () => OrganizationService,
  global = false,
) {
  const context = (req: Request, res: Response): OrganizationContext => ({
    actorId: principal(res).user.id,
    companyId: global
      ? v.id.parse(req.params.companyId)
      : res.locals.workspace.companyId,
    scope: global ? "GLOBAL" : res.locals.workspace.scope,
    ...(!global && res.locals.workspace.agencyId
      ? { agencyId: res.locals.workspace.agencyId }
      : {}),
  });
  const q = (req: Request) => v.query.parse(req.query),
    id = (req: Request) => v.id.parse(req.params.id);
  return {
    access:
      (permission: string) =>
      async (req: Request, res: Response, next: (e?: unknown) => void) => {
        try {
          const c = context(req, res);
          if (global) {
            await authorizeOrganization(service().db, c, permission);
          }
          res.locals.organization = c;
          next();
        } catch (e) {
          next(e);
        }
      },
    profile: async (_req: Request, res: Response) =>
      res.json(await service().repository.profile(res.locals.organization)),
    updateProfile: async (req: Request, res: Response) =>
      res.json(
        await service().updateProfile(
          res.locals.organization,
          v.profileInput.parse(req.body),
        ),
      ),
    logo: async (_req: Request, res: Response) =>
      res.json(await getLogo(service(), res.locals.organization.companyId)),
    putLogo: async (req: Request, res: Response) => {
      const c = res.locals.organization as OrganizationContext,
        version = v.version.parse(Number(req.get("X-Company-Version")));
      await persistLogo(
        req.body as Buffer,
        req.get("Content-Type") ?? "",
        (key) =>
          service().write(c, "company.profile.write", async (tx) => {
            const p = await tx.company.findUniqueOrThrow({
              where: { id: c.companyId },
            });
            checkVersion(p.version, version);
            await tx.company.update({
              where: { id: c.companyId },
              data: { logoKey: key, version: { increment: 1 } },
            });
            await service().audit(tx, c, "COMPANY_LOGO_UPDATED", c.companyId);
          }),
      );
      res.json(await service().repository.profile(c));
    },
    agencies: async (req: Request, res: Response) =>
      res.json(
        await service().repository.agencies(res.locals.organization, q(req)),
      ),
    agency: async (req: Request, res: Response) =>
      res.json(
        await service().repository.agency(
          res.locals.organization,
          id(req),
          res.locals.workspace.scope === "GLOBAL" ||
            res.locals.workspace.permissions.includes("employees.read"),
        ),
      ),
    createAgency: async (req: Request, res: Response) =>
      res
        .status(201)
        .json(
          await service().createAgency(
            res.locals.organization,
            v.agencyFields.parse(req.body),
          ),
        ),
    updateAgency: async (req: Request, res: Response) =>
      res.json(
        await service().updateAgency(
          res.locals.organization,
          id(req),
          v.agencyUpdate.parse(req.body),
        ),
      ),
    agencyStatus: async (req: Request, res: Response) =>
      res.json(
        await service().agencyStatus(
          res.locals.organization,
          id(req),
          v.agencyStatus.parse(req.body),
        ),
      ),
    primary: async (req: Request, res: Response) =>
      res.json(
        await service().primary(
          res.locals.organization,
          id(req),
          v.primaryInput.parse(req.body),
        ),
      ),
    employees: async (req: Request, res: Response) =>
      res.json(
        await service().repository.employees(res.locals.organization, q(req)),
      ),
    employee: async (req: Request, res: Response) => {
      const p = await service().repository.employee(
        res.locals.organization,
        id(req),
      );
      if (!p)
        throw new AuthError(
          404,
          "MEMBER_NOT_FOUND",
          "Affiliation introuvable.",
        );
      res.json(p);
    },
    updateEmployee: async (req: Request, res: Response) =>
      res.json(
        await service().updateEmployee(
          res.locals.organization,
          id(req),
          v.employeeInput.parse(req.body),
        ),
      ),
    removeEmployee: async (req: Request, res: Response) =>
      res.json(
        await service().removeEmployee(
          res.locals.organization,
          id(req),
          v.removalInput.parse(req.body),
        ),
      ),
    drivers: async (req: Request, res: Response) =>
      res.json(
        await service().repository.employees(
          res.locals.organization,
          q(req),
          true,
        ),
      ),
    driver: async (req: Request, res: Response) => {
      const p = await service().repository.employee(
        res.locals.organization,
        id(req),
      );
      if (!p?.driverProfile)
        throw new AuthError(404, "DRIVER_NOT_FOUND", "Livreur introuvable.");
      res.json(p);
    },
    updateDriver: async (req: Request, res: Response) =>
      res.json(
        await service().updateDriver(
          res.locals.organization,
          id(req),
          v.driverInput.parse(req.body),
        ),
      ),
    invite: async (req: Request, res: Response) =>
      res
        .status(201)
        .json(
          await service().invite(
            res.locals.organization,
            v.inviteInput.parse(req.body),
          ),
        ),
    invitations: async (req: Request, res: Response) =>
      res.json(
        await service().repository.invitations(res.locals.organization, q(req)),
      ),
    invitationAction:
      (action: "resend" | "revoke") => async (req: Request, res: Response) =>
        res.json(
          await service().invitationAction(
            res.locals.organization,
            id(req),
            v.removalInput.pick({ version: true }).parse(req.body).version,
            action,
          ),
        ),
    history: async (req: Request, res: Response) =>
      res.json(
        await service().repository.history(res.locals.organization, q(req)),
      ),
    self: async (_req: Request, res: Response) =>
      res.json(await service().repository.self(res.locals.organization)),
    driverSelf: async (_req: Request, res: Response) =>
      res.json(await service().driverSelf(res.locals.organization)),
    availability: async (req: Request, res: Response) =>
      res.json(
        await service().availability(
          res.locals.organization,
          v.availabilityInput.parse(req.body),
        ),
      ),
  };
}
