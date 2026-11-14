import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { serializable } from "../../database/transaction.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { authorizeTenant } from "../authorization/tenant-access.js";
import { AuthError } from "../auth/errors.js";
import { hashPassword, opaqueToken, tokenHash } from "../auth/crypto.js";
import type { AdminService } from "../admin/service.js";
import { OrganizationRepository } from "./repository.js";
import { agencyRole, type StaffRole } from "./permissions.js";
import {
  lockOrganization,
  checkVersion,
  conflict,
  agencyBlockers,
  withdrawAgencyLinks,
  type OrganizationContext,
} from "./access.js";
import type { z } from "zod";
import * as v from "./validation.js";
import { protectFinancialAffiliation } from "../collections/protection.js";
type Tx = Prisma.TransactionClient;
export class OrganizationService {
  readonly repository: OrganizationRepository;
  constructor(
    readonly db: PrismaClient,
    readonly invitations?: Pick<AdminService, "deliver" | "invitationHours">,
  ) {
    this.repository = new OrganizationRepository(db);
  }
  async transaction<T>(work: (tx: Tx) => Promise<T>) {
    try {
      return await serializable(this.db, work);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw conflict(
          "Cette r�f�rence, ce matricule ou cette invitation existe d�j�.",
          "DUPLICATE",
        );
      throw e;
    }
  }
  async write<T>(
    c: OrganizationContext,
    permission: string,
    work: (tx: Tx) => Promise<T>,
  ) {
    return this.transaction(async (tx) => {
      await lockOrganization(tx, c, permission);
      return work(tx);
    });
  }
  audit(
    tx: Tx,
    c: OrganizationContext,
    action: string,
    entityId: string,
    metadata: Prisma.InputJsonObject = {},
    agencyId?: string,
  ) {
    return tx.auditLog.create({
      data: {
        companyId: c.companyId,
        actorId: c.actorId,
        agencyId: agencyId ?? null,
        action: `ORG_${action}`,
        entityType: "Organization",
        entityId,
        metadata,
      },
    });
  }
  async updateProfile(
    c: OrganizationContext,
    input: z.infer<typeof v.profileInput>,
  ) {
    await this.write(c, "company.profile.write", async (tx) => {
      const p = await tx.company.findUniqueOrThrow({
        where: { id: c.companyId },
      });
      checkVersion(p.version, input.version);
      const { version, ...fields } = input;
      void version;
      await tx.company.update({
        where: { id: c.companyId },
        data: { ...fields, version: { increment: 1 } },
      });
      await this.audit(tx, c, "COMPANY_PROFILE_UPDATED", c.companyId, {
        fields: Object.keys(fields),
      });
    });
    return this.repository.profile(c);
  }
  async agencyRecord(
    tx: Tx,
    c: OrganizationContext,
    id: string,
    version?: number,
  ) {
    const a = await tx.agency.findFirst({
      where: { id, companyId: c.companyId, archivedAt: null },
    });
    if (!a) throw new AuthError(404, "AGENCY_NOT_FOUND", "Agence introuvable.");
    if (version !== undefined) checkVersion(a.version, version);
    return a;
  }
  async createAgency(
    c: OrganizationContext,
    input: z.infer<typeof v.agencyFields>,
  ) {
    return this.write(c, "agencies.create", async (tx) => {
      const a = await tx.agency.create({
        data: { ...input, companyId: c.companyId },
      });
      await this.audit(
        tx,
        c,
        "AGENCY_CREATED",
        a.id,
        { reference: a.reference },
        a.id,
      );
      return a;
    });
  }
  async updateAgency(
    c: OrganizationContext,
    id: string,
    input: z.infer<typeof v.agencyUpdate>,
  ) {
    return this.write(c, "agencies.update", async (tx) => {
      await this.agencyRecord(tx, c, id, input.version);
      const { version, ...fields } = input;
      void version;
      const a = await tx.agency.update({
        where: { id },
        data: { ...fields, version: { increment: 1 } },
      });
      await this.audit(
        tx,
        c,
        "AGENCY_UPDATED",
        id,
        { fields: Object.keys(fields) },
        id,
      );
      return a;
    });
  }
  async agencyStatus(
    c: OrganizationContext,
    id: string,
    input: z.infer<typeof v.agencyStatus>,
  ) {
    return this.write(c, "agencies.status", async (tx) => {
      await this.agencyRecord(tx, c, id, input.version);
      if (input.status === "INACTIVE") {
        const blockers = await agencyBlockers(tx, c.companyId, id);
        if (Object.values(blockers).some(Boolean))
          throw conflict(
            `Une action corrective est requise : ${blockers.deliveries} livraison(s), ${blockers.orders} commande(s), ${blockers.stock} stock(s), ${blockers.transfers} transfert(s), ${blockers.financial} situation(s) financi�re(s).`,
            "AGENCY_OPERATIONS_PENDING",
          );
      }
      const a = await tx.agency.update({
        where: { id },
        data: { status: input.status, version: { increment: 1 } },
      });
      if (input.status === "INACTIVE") {
        const drivers = await tx.driverProfile.findMany({
          where: {
            companyId: c.companyId,
            availability: "AVAILABLE",
            membership: {
              agencyMembership_membershipRecords: {
                some: { agencyId: id, active: true },
              },
            },
          },
        });
        for (const d of drivers) {
          const active = await tx.agencyMembership.count({
            where: {
              companyId: c.companyId,
              userId: d.userId,
              active: true,
              role: { code: "courier" },
              agency: { status: "ACTIVE", archivedAt: null },
            },
          });
          if (!active) {
            await tx.driverProfile.update({
              where: { id: d.id },
              data: {
                availability: "UNAVAILABLE",
                availabilityChangedAt: new Date(),
                version: { increment: 1 },
              },
            });
            await this.audit(
              tx,
              c,
              "DRIVER_UNAVAILABLE",
              d.id,
              { reason: "last_agency_inactive" },
              id,
            );
          }
        }
      }
      await this.audit(
        tx,
        c,
        input.status === "ACTIVE" ? "AGENCY_ACTIVATED" : "AGENCY_DEACTIVATED",
        id,
        { reason: input.reason },
        id,
      );
      return a;
    });
  }
  async primary(
    c: OrganizationContext,
    id: string,
    input: z.infer<typeof v.primaryInput>,
  ) {
    return this.write(c, "agencies.update", async (tx) => {
      await this.agencyRecord(tx, c, id, input.version);
      if (input.userId) {
        const m = await tx.agencyMembership.findFirst({
          where: {
            companyId: c.companyId,
            agencyId: id,
            userId: input.userId,
            active: true,
            role: { code: "agency_manager" },
            membership: {
              active: true,
              user: { status: "ACTIVE", archivedAt: null },
            },
            agency: { status: "ACTIVE" },
          },
        });
        if (!m)
          throw conflict(
            "Choisissez un responsable actif affect� � cette agence.",
          );
      }
      const a = await tx.agency.update({
        where: { id },
        data: { primaryManagerUserId: input.userId, version: { increment: 1 } },
      });
      await this.audit(
        tx,
        c,
        "AGENCY_PRIMARY_CHANGED",
        id,
        { userId: input.userId },
        id,
      );
      return a;
    });
  }
  async validateAgencies(tx: Tx, companyId: string, ids: string[]) {
    if (new Set(ids).size !== ids.length) throw conflict("Agence r�p�t�e.");
    if (
      (await tx.agency.count({
        where: {
          companyId,
          id: { in: ids },
          status: "ACTIVE",
          archivedAt: null,
        },
      })) !== ids.length
    )
      throw conflict(
        "Chaque agence doit �tre active et appartenir � cette entreprise.",
        "AGENCY_ASSIGNMENT_DENIED",
      );
  }
  async assign(
    tx: Tx,
    c: OrganizationContext,
    userId: string,
    role: StaffRole,
    ids: string[],
    active = true,
  ) {
    await this.validateAgencies(tx, c.companyId, ids);
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || (active && (user.status !== "ACTIVE" || user.archivedAt)))
      throw conflict("Ce compte ne peut pas �tre activ� dans l'entreprise.");
    if (role !== "employee" && !ids.length)
      throw conflict("S�lectionnez une agence.");
    const companyRole = await tx.role.findUnique({
        where: { code: "company_member" },
      }),
      localRole = await tx.role.findUnique({
        where: { code: agencyRole(role) },
      });
    if (companyRole?.scope !== "COMPANY" || localRole?.scope !== "AGENCY")
      throw conflict("Initialisez les r�les de r�f�rence.");
    const old = await tx.companyMembership.findUnique({
      where: { companyId_userId: { companyId: c.companyId, userId } },
      include: { role: true },
    });
    await protectFinancialAffiliation(
      tx,
      c.companyId,
      userId,
      active && role === "courier" ? ids : undefined,
    );
    if (old?.role.code === "company_admin")
      throw conflict(
        "Les administrateurs sont g�r�s depuis le module global.",
        "ADMIN_PROTECTED",
      );
    const protectedAgencies = await tx.agency.findMany({
      where: { companyId: c.companyId, primaryManagerUserId: userId },
    });
    for (const a of protectedAgencies) {
      if (!active || role !== "agency_manager" || !ids.includes(a.id)) {
        await tx.agency.update({
          where: { id: a.id },
          data: { primaryManagerUserId: null, version: { increment: 1 } },
        });
        await this.audit(
          tx,
          c,
          "AGENCY_PRIMARY_CLEARED",
          a.id,
          { userId },
          a.id,
        );
      }
    }
    const membership = await tx.companyMembership.upsert({
      where: { companyId_userId: { companyId: c.companyId, userId } },
      create: {
        companyId: c.companyId,
        userId,
        roleId: companyRole.id,
        roleScope: "COMPANY",
        organizationRole: role,
        active,
        employmentStatus: active ? "ACTIVE" : "SUSPENDED",
      },
      update: {
        roleId: companyRole.id,
        roleScope: "COMPANY",
        organizationRole: role,
        active,
        employmentStatus: active ? "ACTIVE" : "SUSPENDED",
        version: { increment: 1 },
      },
    });
    await tx.agencyMembership.updateMany({
      where: { companyId: c.companyId, userId },
      data: { active: false },
    });
    for (const agencyId of ids) {
      await tx.agencyMembership.upsert({
        where: {
          companyId_agencyId_userId: {
            companyId: c.companyId,
            agencyId,
            userId,
          },
        },
        create: {
          companyId: c.companyId,
          agencyId,
          userId,
          roleId: localRole.id,
          roleScope: "AGENCY",
          active,
        },
        update: { roleId: localRole.id, roleScope: "AGENCY", active },
      });
      await this.audit(
        tx,
        c,
        "AGENCY_ASSIGNMENT_CHANGED",
        membership.id,
        { userId, role, active },
        agencyId,
      );
    }
    if (role === "courier")
      await tx.driverProfile.upsert({
        where: { companyId_userId: { companyId: c.companyId, userId } },
        create: {
          companyId: c.companyId,
          userId,
          status: active ? "ACTIVE" : "SUSPENDED",
        },
        update: {
          ...(active
            ? {}
            : {
                status: "SUSPENDED",
                availability: "UNAVAILABLE",
                availabilityChangedAt: new Date(),
              }),
          version: { increment: 1 },
        },
      });
    else
      await tx.driverProfile.updateMany({
        where: { companyId: c.companyId, userId },
        data: {
          status: "INACTIVE",
          availability: "UNAVAILABLE",
          availabilityChangedAt: new Date(),
          version: { increment: 1 },
        },
      });
    await this.audit(tx, c, "EMPLOYEE_ROLE_CHANGED", membership.id, {
      userId,
      role,
      agencyIds: ids,
      active,
    });
    return membership;
  }
  async updateEmployee(
    c: OrganizationContext,
    userId: string,
    input: z.infer<typeof v.employeeInput>,
  ) {
    await this.write(c, "employees.manage", async (tx) => {
      const m = await tx.companyMembership.findUnique({
        where: { companyId_userId: { companyId: c.companyId, userId } },
      });
      if (!m)
        throw new AuthError(
          404,
          "MEMBER_NOT_FOUND",
          "Affiliation introuvable.",
        );
      checkVersion(m.version, input.version);
      await this.assign(
        tx,
        c,
        userId,
        input.role,
        input.agencyIds,
        input.status === "ACTIVE",
      );
      await tx.companyMembership.update({
        where: { id: m.id },
        data: { employmentStatus: input.status },
      });
    });
    return this.repository.employee(c, userId);
  }
  async removeEmployee(
    c: OrganizationContext,
    userId: string,
    input: z.infer<typeof v.removalInput>,
  ) {
    await this.write(c, "employees.remove", async (tx) => {
      const m = await tx.companyMembership.findUnique({
        where: { companyId_userId: { companyId: c.companyId, userId } },
        include: { role: true },
      });
      if (!m)
        throw new AuthError(
          404,
          "MEMBER_NOT_FOUND",
          "Affiliation introuvable.",
        );
      checkVersion(m.version, input.version);
      if (m.role.code === "company_admin")
        throw conflict(
          "Le retrait d'un administrateur passe par le module global.",
          "ADMIN_PROTECTED",
        );
      await withdrawAgencyLinks(tx, c.companyId, userId, c.actorId);
      await tx.companyMembership.update({
        where: { id: m.id },
        data: {
          active: false,
          employmentStatus: "INACTIVE",
          version: { increment: 1 },
        },
      });
      await this.audit(tx, c, "EMPLOYEE_AFFILIATION_REMOVED", m.id, {
        userId,
        reason: input.reason,
      });
    });
    return {
      message:
        "Affiliation retir�e. Le compte et ses autres entreprises sont conserv�s.",
    };
  }
  async updateDriver(
    c: OrganizationContext,
    userId: string,
    input: z.infer<typeof v.driverInput>,
  ) {
    return this.write(c, "drivers.manage", async (tx) => {
      const d = await tx.driverProfile.findUnique({
        where: { companyId_userId: { companyId: c.companyId, userId } },
        include: { membership: true },
      });
      if (
        !d ||
        !d.membership.active ||
        d.membership.organizationRole !== "courier"
      )
        throw conflict("Profil livreur indisponible.");
      checkVersion(d.version, input.version);
      const { version, ...fields } = input;
      void version;
      const result = await tx.driverProfile.update({
        where: { id: d.id },
        data: {
          ...fields,
          ...(input.status !== "ACTIVE"
            ? { availability: "UNAVAILABLE", availabilityChangedAt: new Date() }
            : {}),
          version: { increment: 1 },
        },
      });
      await this.audit(tx, c, "DRIVER_PROFILE_UPDATED", d.id, {
        status: input.status,
        transport: input.transport,
      });
      return result;
    });
  }
  async driverSelf(c: OrganizationContext) {
    const d = await this.repository.self(c);
    if (!d?.driverProfile || d.organizationRole !== "courier")
      throw new AuthError(403, "DRIVER_REQUIRED", "Profil livreur requis.");
    return d;
  }
  async availability(
    c: OrganizationContext,
    input: z.infer<typeof v.availabilityInput>,
  ) {
    return this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Company WHERE id=${c.companyId} FOR UPDATE`;
      await authorizeTenant(
        authorizationStore(tx),
        {
          userId: c.actorId,
          companyId: c.companyId,
          ...(c.agencyId ? { agencyId: c.agencyId } : {}),
        },
        "drivers.availability.write",
      );
      const d = await tx.driverProfile.findUnique({
        where: {
          companyId_userId: { companyId: c.companyId, userId: c.actorId },
        },
      });
      if (!d || d.status !== "ACTIVE")
        throw new AuthError(
          403,
          "DRIVER_SUSPENDED",
          "Votre profil livreur n'est pas actif.",
        );
      checkVersion(d.version, input.version);
      const assigned = await tx.agencyMembership.findFirst({
        where: {
          companyId: c.companyId,
          userId: c.actorId,
          ...(c.agencyId ? { agencyId: c.agencyId } : {}),
          active: true,
          role: { code: "courier" },
          agency: { status: "ACTIVE", archivedAt: null },
          membership: { active: true },
        },
      });
      if (!assigned)
        throw new AuthError(
          403,
          "DRIVER_UNASSIGNED",
          "Aucune agence active autoris�e.",
        );
      const result = await tx.driverProfile.update({
        where: { id: d.id },
        data: {
          availability: input.availability,
          availabilityChangedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        c,
        "DRIVER_AVAILABILITY_CHANGED",
        d.id,
        { availability: input.availability },
        assigned.agencyId,
      );
      return result;
    });
  }
  async invite(c: OrganizationContext, input: z.infer<typeof v.inviteInput>) {
    if (!this.invitations) throw Error("Invitation transport missing");
    const result = await this.write(c, "employees.invite", async (tx) => {
      await this.validateAgencies(tx, c.companyId, input.agencyIds);
      const duplicate = await tx.companyInvitation.findFirst({
        where: {
          companyId: c.companyId,
          email: input.email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (duplicate)
        throw conflict("Renvoyez ou r�voquez l'invitation existante.");
      const existing = await tx.user.findUnique({
        where: { email: input.email },
      });
      if (existing) {
        const member = await tx.companyMembership.findUnique({
          where: {
            companyId_userId: { companyId: c.companyId, userId: existing.id },
          },
        });
        if (member?.active)
          throw conflict(
            "Ce compte est d�j� affili�. Modifiez ses affectations.",
          );
      }
      const raw = opaqueToken(),
        invitation = await tx.companyInvitation.create({
          data: {
            companyId: c.companyId,
            email: input.email,
            fullName: input.fullName,
            kind: "STAFF",
            staffRole: input.role,
            agencyIds: input.agencyIds,
            createdById: c.actorId,
            tokenHash: tokenHash(raw),
            expiresAt: new Date(
              Date.now() + this.invitations!.invitationHours * 3600000,
            ),
          },
        });
      await this.audit(tx, c, "EMPLOYEE_INVITED", invitation.id, {
        role: input.role,
        agencyIds: input.agencyIds,
      });
      const company = await tx.company.findUniqueOrThrow({
        where: { id: c.companyId },
      });
      return { raw, invitation, company };
    });
    const sent = await this.invitations.deliver(
      result.invitation,
      result.raw,
      result.company.name,
    );
    return {
      id: result.invitation.id,
      invitationDelivery: sent ? "SENT" : "FAILED",
    };
  }
  async invitationAction(
    c: OrganizationContext,
    id: string,
    version: number,
    action: "resend" | "revoke",
  ) {
    const result = await this.write(c, "employees.invite", async (tx) => {
      const i = await tx.companyInvitation.findFirst({
        where: { id, companyId: c.companyId, kind: "STAFF" },
      });
      if (!i)
        throw new AuthError(
          404,
          "INVITATION_NOT_FOUND",
          "Invitation introuvable.",
        );
      checkVersion(i.version, version);
      if (i.acceptedAt || i.revokedAt)
        throw conflict("Invitation d�j� cl�tur�e.");
      let raw: string | undefined;
      if (action === "resend") {
        raw = opaqueToken();
        await this.validateAgencies(
          tx,
          c.companyId,
          (i.agencyIds ?? []) as string[],
        );
      }
      const invitation = await tx.companyInvitation.update({
        where: { id },
        data: {
          ...(raw
            ? {
                tokenHash: tokenHash(raw),
                expiresAt: new Date(
                  Date.now() +
                    (this.invitations?.invitationHours ?? 48) * 3600000,
                ),
                deliveryStatus: "PENDING",
              }
            : { revokedAt: new Date() }),
          version: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        c,
        action === "resend" ? "INVITATION_RESENT" : "INVITATION_REVOKED",
        id,
      );
      const company = await tx.company.findUniqueOrThrow({
        where: { id: c.companyId },
      });
      return { invitation, raw, company };
    });
    const sent =
      result.raw && this.invitations
        ? await this.invitations.deliver(
            result.invitation,
            result.raw,
            result.company.name,
          )
        : null;
    return {
      invitationDelivery: sent === null ? null : sent ? "SENT" : "FAILED",
    };
  }
  async accept(
    raw: string,
    newAccount?: { fullName: string; password: string },
    existingUserId?: string,
  ) {
    const passwordHash = newAccount
      ? await hashPassword(newAccount.password)
      : null;
    return this.transaction(async (tx) => {
      const first = await tx.companyInvitation.findUnique({
        where: { tokenHash: tokenHash(raw) },
      });
      if (!first || first.kind !== "STAFF")
        throw new AuthError(
          400,
          "INVITATION_INVALID",
          "Invitation indisponible.",
        );
      await tx.$queryRaw`SELECT id FROM Company WHERE id=${first.companyId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM CompanyInvitation WHERE id=${first.id} FOR UPDATE`;
      const i = await tx.companyInvitation.findUniqueOrThrow({
        where: { id: first.id },
        include: { company: true },
      });
      if (
        i.tokenHash !== tokenHash(raw) ||
        i.acceptedAt ||
        i.revokedAt ||
        i.expiresAt <= new Date()
      )
        throw new AuthError(
          400,
          "INVITATION_INVALID",
          "Invitation expir�e, remplac�e ou cl�tur�e.",
        );
      const senderGlobal = await tx.globalRoleGrant.findUnique({
        where: { userId: i.createdById },
        include: {
          role: {
            include: {
              rolePermission_roleRecords: { include: { permission: true } },
            },
          },
        },
      });
      const global =
        senderGlobal?.active &&
        senderGlobal.role.rolePermission_roleRecords.some(
          (p) => p.permission.code === "platform.manage",
        );
      const c: OrganizationContext = {
        actorId: i.createdById,
        companyId: i.companyId,
        scope: global ? "GLOBAL" : "COMPANY",
      };
      await lockOrganization(tx, c, "employees.invite");
      const role = v.staffInput.parse({
        role: i.staffRole,
        agencyIds: i.agencyIds ?? [],
      });
      let user = await tx.user.findUnique({ where: { email: i.email } });
      if (user) {
        if (
          !existingUserId ||
          existingUserId !== user.id ||
          user.status !== "ACTIVE" ||
          user.archivedAt
        )
          throw new AuthError(
            403,
            "EXISTING_ACCOUNT_REQUIRED",
            "Connectez-vous avec le compte destinataire pour accepter.",
          );
      } else {
        if (!newAccount || !passwordHash || existingUserId)
          throw new AuthError(
            409,
            "NEW_ACCOUNT_REQUIRED",
            "Cette invitation n�cessite la cr�ation du compte destinataire.",
          );
        user = await tx.user.create({
          data: {
            email: i.email,
            fullName: newAccount.fullName,
            passwordHash,
            emailVerifiedAt: new Date(),
          },
        });
      }
      await this.assign(tx, c, user.id, role.role, role.agencyIds);
      await tx.companyInvitation.update({
        where: { id: i.id },
        data: { acceptedAt: new Date(), version: { increment: 1 } },
      });
      await this.audit(
        tx,
        { ...c, actorId: user.id },
        "INVITATION_ACCEPTED",
        i.id,
        { invitedById: i.createdById, userId: user.id },
      );
      return {
        message:
          "Affiliation activ�e. Connectez-vous ou actualisez vos organisations pour s�lectionner cet acc�s.",
      };
    });
  }
}
