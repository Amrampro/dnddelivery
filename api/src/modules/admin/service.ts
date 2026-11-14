import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { serializable } from "../../database/transaction.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { authorizeGlobal } from "../authorization/tenant-access.js";
import { AuthError } from "../auth/errors.js";
import { hashPassword, opaqueToken, tokenHash } from "../auth/crypto.js";
import { OrganizationService } from "../organization/service.js";
import { withdrawAgencyLinks } from '../organization/access.js';
import {
  AdminRepository,
  companySelect,
  companyDto,
  invitationSelect,
} from "./repository.js";
import type { CreateCompany, UpdateCompany } from "./validation.js";
export interface InvitationMailer {
  available(): boolean;
  send(to: string, link: string, company: string): Promise<void>;
}
type Tx = Prisma.TransactionClient;
export class AdminService {
  readonly repository: AdminRepository;
  constructor(
    readonly db: PrismaClient,
    readonly mailer: InvitationMailer,
    readonly webUrl: string,
    readonly invitationHours = 48,
  ) {
    this.repository = new AdminRepository(db);
  }
  async write<T>(actorId: string, work: (tx: Tx) => Promise<T>) {
    try {
      return await serializable(this.db, async (tx) => {
        await authorizeGlobal(
          authorizationStore(tx),
          actorId,
          "platform.manage",
        );
        return work(tx);
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw new AuthError(
          409,
          "DUPLICATE",
          "Cette r�f�rence ou cette adresse est d�j� utilis�e. Rechargez les donn�es et v�rifiez le compte existant.",
        );
      throw e;
    }
  }
  async lockCompany(tx: Tx, id: string, version?: number) {
    await tx.$queryRaw`SELECT id FROM Company WHERE id = ${id} FOR UPDATE`;
    const company = await tx.company.findUnique({
      where: { id },
      select: companySelect,
    });
    if (!company)
      throw new AuthError(404, "COMPANY_NOT_FOUND", "Entreprise introuvable.");
    if (company.status === "ARCHIVED")
      throw new AuthError(
        409,
        "COMPANY_ARCHIVED",
        "Cette entreprise est archiv�e.",
      );
    if (version !== undefined && company.version !== version)
      throw new AuthError(
        409,
        "VERSION_CONFLICT",
        "Les donn�es ont chang�. Rechargez la fiche avant de r�essayer.",
      );
    return company;
  }
  audit(
    tx: Tx,
    actorId: string,
    companyId: string,
    action: string,
    metadata: Prisma.InputJsonObject = {},
    entityId = companyId,
  ) {
    return tx.auditLog.create({
      data: {
        actorId,
        companyId,
        action,
        entityType: entityId === companyId ? "Company" : "CompanyInvitation",
        entityId,
        metadata,
      },
    });
  }
  async role(tx: Tx) {
    const role = await tx.role.findUnique({ where: { code: "company_admin" } });
    if (!role || role.scope !== "COMPANY")
      throw new AuthError(
        503,
        "ROLE_NOT_CONFIGURED",
        "Les r�les de r�f�rence doivent �tre initialis�s avant cette op�ration.",
      );
    return role;
  }
  async assign(
    tx: Tx,
    companyId: string,
    userId: string,
    primary: boolean,
    actor: string,
  ) {
    const role = await this.role(tx),
      user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "ACTIVE" || user.archivedAt)
      throw new AuthError(
        409,
        "USER_UNAVAILABLE",
        "Cet utilisateur ne peut pas administrer une entreprise.",
      );
    await tx.companyMembership.upsert({
      where: { companyId_userId: { companyId, userId } },
      create: { companyId, userId, roleId: role.id, roleScope: "COMPANY" },
      update: { roleId: role.id, roleScope: "COMPANY", active: true,employmentStatus:'ACTIVE',version:{increment:1} },
    });
    if (primary) {
      await tx.company.update({
        where: { id: companyId },
        data: { primaryAdminUserId: userId },
      });
      await tx.companyInvitation.updateMany({
        where: {
          companyId,
          acceptedAt: null,
          revokedAt: null,
          isPrimary: true,
        },
        data: { isPrimary: false, version: { increment: 1 } },
      });
    }
    await this.audit(
      tx,
      actor,
      companyId,
      primary ? "COMPANY_PRIMARY_CHANGED" : "COMPANY_ADMIN_ASSIGNED",
      { userId },
    );
  }
  async prepareInvitation(
    tx: Tx,
    companyId: string,
    email: string,
    fullName: string,
    primary: boolean,
    actor: string,
  ) {
    await this.role(tx);
    if (await tx.user.findUnique({ where: { email } }))
      throw new AuthError(
        409,
        "EXISTING_USER",
        "Cette adresse poss�de d�j� un compte. Associez l'utilisateur existant.",
      );
    const pending = await tx.companyInvitation.findFirst({
      where: { companyId, email, acceptedAt: null, revokedAt: null },
    });
    if (pending)
      throw new AuthError(
        409,
        "INVITATION_PENDING",
        "Une invitation existe d�j�. Renvoyez-la ou r�voquez-la.",
      );
    if (primary)
      await tx.companyInvitation.updateMany({
        where: {
          companyId,
          isPrimary: true,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { isPrimary: false, version: { increment: 1 } },
      });
    const raw = opaqueToken();
    const invitation = await tx.companyInvitation.create({
      data: {
        companyId,
        email,
        fullName,
        isPrimary: primary,
        tokenHash: tokenHash(raw),
        expiresAt: new Date(Date.now() + this.invitationHours * 3600000),
        createdById: actor,
      },
    });
    await this.audit(
      tx,
      actor,
      companyId,
      "COMPANY_ADMIN_INVITED",
      { email, primary },
      invitation.id,
    );
    return { invitation, raw };
  }
  async deliver(
    invitation: {
      id: string;
      tokenHash: string;
      email: string;
      companyId: string;
    },
    raw: string,
    companyName: string,
  ) {
    let sent = false;
    try {
      if (this.mailer.available()) {
        await this.mailer.send(
          invitation.email,
          `${this.webUrl}/invitation#token=${raw}`,
          companyName,
        );
        sent = true;
      }
    } catch {
      /* Persist failure without recording tokens or transport credentials. */
    }
    await this.db.companyInvitation.updateMany({
      where: {
        id: invitation.id,
        tokenHash: invitation.tokenHash,
        acceptedAt: null,
        revokedAt: null,
      },
      data: {
        deliveryStatus: sent ? "SENT" : "FAILED",
        ...(sent ? { lastSentAt: new Date() } : {}),
      },
    });
    return sent;
  }
  async create(actor: string, input: CreateCompany) {
    const result = await this.write(actor, async (tx) => {
      const { administrator, ...fields } = input;
      const company = await tx.company.create({
        data: {
          ...fields,
          statusChangedAt: new Date(),
          statusChangedById: actor,
        },
        select: companySelect,
      });
      await this.audit(tx, actor, company.id, "COMPANY_CREATED", {
        reference: company.reference,
        status: company.status,
      });
      let pending:
        | Awaited<ReturnType<AdminService["prepareInvitation"]>>
        | undefined;
      if (administrator.mode === "existing")
        await this.assign(tx, company.id, administrator.userId, true, actor);
      else
        pending = await this.prepareInvitation(
          tx,
          company.id,
          administrator.email,
          administrator.fullName,
          true,
          actor,
        );
      return { company, pending };
    });
    const sent = result.pending
      ? await this.deliver(
          result.pending.invitation,
          result.pending.raw,
          result.company.name,
        )
      : null;
    return {
      company: companyDto(
        await this.db.company.findUniqueOrThrow({
          where: { id: result.company.id },
          select: companySelect,
        }),
      ),
      invitationDelivery: sent === null ? null : sent ? "SENT" : "FAILED",
    };
  }
  async detail(id: string) {
    const company = await this.db.company.findUnique({
      where: { id },
      select: companySelect,
    });
    if (!company)
      throw new AuthError(404, "COMPANY_NOT_FOUND", "Entreprise introuvable.");
    const [admins, invitations, history] = await Promise.all([
      this.repository.admins(id),
      this.db.companyInvitation.findMany({
        where: { companyId: id, kind: "ADMIN" },
        select: invitationSelect,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.repository.history(1, 10, id),
    ]);
    return { company: companyDto(company), admins, invitations, history };
  }
  async update(actor: string, id: string, input: UpdateCompany) {
    await this.write(actor, async (tx) => {
      const before = await this.lockCompany(tx, id, input.version);
      const { version, ...fields } = input;
      const changedFields = Object.keys(fields).filter(
        (k) =>
          fields[k as keyof typeof fields] !== before[k as keyof typeof before],
      );
      await tx.company.update({
        where: { id },
        data: { ...fields, version: { increment: 1 } },
      });
      await this.audit(tx, actor, id, "COMPANY_UPDATED", {
        changedFields,
        previousVersion: version,
      });
    });
    return this.detail(id);
  }
  async status(
    actor: string,
    id: string,
    version: number,
    status: "ACTIVE" | "INACTIVE" | "SUSPENDED",
    reason: string,
  ) {
    await this.write(actor, async (tx) => {
      const before = await this.lockCompany(tx, id, version);
      if (before.status === status)
        throw new AuthError(
          409,
          "STATUS_UNCHANGED",
          "Ce statut est d�j� appliqu�.",
        );
      await tx.company.update({
        where: { id },
        data: {
          status,
          administrativeReason: reason,
          statusChangedAt: new Date(),
          statusChangedById: actor,
          version: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        actor,
        id,
        status === "SUSPENDED"
          ? "COMPANY_SUSPENDED"
          : status === "INACTIVE"
            ? "COMPANY_DEACTIVATED"
            : before.status === "INACTIVE"
              ? "COMPANY_ACTIVATED"
              : "COMPANY_REACTIVATED",
        { from: before.status, to: status, reason },
      );
    });
    return this.detail(id);
  }
  async addAdmin(
    actor: string,
    id: string,
    userId: string,
    version: number,
    primary: boolean,
  ) {
    await this.write(actor, async (tx) => {
      const company = await this.lockCompany(tx, id, version);
      await this.assign(
        tx,
        id,
        userId,
        primary || !company.primaryAdminUserId,
        actor,
      );
      await tx.company.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
    });
    return this.detail(id);
  }
  async changePrimary(
    actor: string,
    id: string,
    userId: string,
    version: number,
  ) {
    await this.write(actor, async (tx) => {
      await this.lockCompany(tx, id, version);
      const membership = await tx.companyMembership.findUnique({
        where: { companyId_userId: { companyId: id, userId } },
        include: { role: true, user: true },
      });
      if (
        !membership?.active ||
        membership.role.code !== "company_admin" ||
        membership.user.status !== "ACTIVE" ||
        membership.user.archivedAt
      )
        throw new AuthError(
          409,
          "ADMIN_UNAVAILABLE",
          "Choisissez un administrateur actif de cette entreprise.",
        );
      await this.assign(tx, id, userId, true, actor);
      await tx.company.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
    });
    return this.detail(id);
  }
  async removeAdmin(
    actor: string,
    id: string,
    userId: string,
    version: number,
  ) {
    await this.write(actor, async (tx) => {
      const company = await this.lockCompany(tx, id, version);
      const target = await tx.companyMembership.findUnique({
        where: { companyId_userId: { companyId: id, userId } },
        include: { role: true },
      });
      if (!target?.active || target.role.code !== "company_admin")
        throw new AuthError(
          404,
          "ADMIN_NOT_FOUND",
          "Affiliation administrateur introuvable.",
        );
      const remaining = await tx.companyMembership.findMany({
        where: {
          companyId: id,
          userId: { not: userId },
          active: true,
          role: { code: "company_admin", scope: "COMPANY" },
          user: { status: "ACTIVE", archivedAt: null },
        },
        orderBy: { createdAt: "asc" },
      });
      if (!remaining.length)
        throw new AuthError(
          409,
          "LAST_ADMIN",
          "Associez un autre administrateur actif avant de retirer le dernier responsable.",
        );
      if (company.primaryAdminUserId === userId)
        await tx.company.update({
          where: { id },
          data: { primaryAdminUserId: remaining[0]!.userId },
        });
      await tx.companyMembership.update({
        where: { id: target.id },
        data: { active: false,employmentStatus:'INACTIVE',version:{increment:1} },
      });
      await withdrawAgencyLinks(tx,id,userId,actor);
      await tx.company.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await this.audit(tx, actor, id, "COMPANY_ADMIN_REMOVED", {
        userId,
        primaryAdminUserId:
          company.primaryAdminUserId === userId
            ? remaining[0]!.userId
            : company.primaryAdminUserId,
      });
    });
    return this.detail(id);
  }
  async invite(
    actor: string,
    id: string,
    version: number,
    email: string,
    fullName: string,
    primary: boolean,
  ) {
    const result = await this.write(actor, async (tx) => {
      const company = await this.lockCompany(tx, id, version);
      const pending = await this.prepareInvitation(
        tx,
        id,
        email,
        fullName,
        primary || !company.primaryAdminUserId,
        actor,
      );
      await tx.company.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      return { company, pending };
    });
    const sent = await this.deliver(
      result.pending.invitation,
      result.pending.raw,
      result.company.name,
    );
    return {
      ...(await this.detail(id)),
      invitationDelivery: sent ? "SENT" : "FAILED",
    };
  }
  async invitationAction(
    actor: string,
    invitationId: string,
    version: number,
    action: "resend" | "revoke",
  ) {
    const result = await this.write(actor, async (tx) => {
      const found = await tx.companyInvitation.findUnique({
        where: { id: invitationId },
      });
      if (!found || found.kind !== "ADMIN")
        throw new AuthError(
          404,
          "INVITATION_NOT_FOUND",
          "Invitation introuvable.",
        );
      const company = await this.lockCompany(tx, found.companyId);
      const current = await tx.companyInvitation.findUniqueOrThrow({
        where: { id: invitationId },
      });
      if (current.version !== version)
        throw new AuthError(
          409,
          "VERSION_CONFLICT",
          "Cette invitation a chang�. Rechargez la fiche.",
        );
      if (current.acceptedAt || current.revokedAt)
        throw new AuthError(
          409,
          "INVITATION_CLOSED",
          "Cette invitation est d�j� cl�tur�e.",
        );
      let raw: string | undefined;
      if (action === "revoke") {
        const admins = await tx.companyMembership.count({
          where: {
            companyId: company.id,
            active: true,
            role: { code: "company_admin" },
            user: { status: "ACTIVE", archivedAt: null },
          },
        });
        const other = await tx.companyInvitation.count({
          where: {
            companyId: company.id,
            id: { not: invitationId },
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
            isPrimary: true,
          },
        });
        if (!admins && !other)
          throw new AuthError(
            409,
            "LAST_RESPONSIBLE",
            "Associez un administrateur ou une invitation principale de remplacement avant cette r�vocation.",
          );
        await tx.companyInvitation.update({
          where: { id: invitationId },
          data: { revokedAt: new Date(), version: { increment: 1 } },
        });
      } else {
        if (await tx.user.findUnique({ where: { email: current.email } }))
          throw new AuthError(
            409,
            "EXISTING_USER",
            "Un compte existe d�sormais pour cette adresse. Associez cet utilisateur et r�voquez l'invitation.",
          );
        raw = opaqueToken();
        await tx.companyInvitation.update({
          where: { id: invitationId },
          data: {
            tokenHash: tokenHash(raw),
            expiresAt: new Date(Date.now() + this.invitationHours * 3600000),
            deliveryStatus: "PENDING",
            version: { increment: 1 },
          },
        });
      }
      await tx.company.update({
        where: { id: company.id },
        data: { version: { increment: 1 } },
      });
      await this.audit(
        tx,
        actor,
        company.id,
        action === "resend"
          ? "COMPANY_INVITATION_RESENT"
          : "COMPANY_INVITATION_REVOKED",
        {},
        invitationId,
      );
      const invitation = await tx.companyInvitation.findUniqueOrThrow({
        where: { id: invitationId },
      });
      return { invitation, raw, company };
    });
    const sent = result.raw
      ? await this.deliver(result.invitation, result.raw, result.company.name)
      : null;
    return {
      ...(await this.detail(result.company.id)),
      invitationDelivery: sent === null ? null : sent ? "SENT" : "FAILED",
    };
  }
  async inspect(raw: string) {
    const invitation = await this.db.companyInvitation.findUnique({
      where: { tokenHash: tokenHash(raw) },
      include: { company: true },
    });
    this.assertInvitation(invitation);
    const existing = await this.db.user.findUnique({
      where: { email: invitation!.email },
      select: { id: true },
    });
    return {
      kind: invitation!.kind,
      role: invitation!.staffRole,
      existingAccount: invitation!.kind === "STAFF" && !!existing,
      companyName: invitation!.company.name,
      email: invitation!.email,
      fullName: invitation!.fullName,
      expiresAt: invitation!.expiresAt,
    };
  }
  assertInvitation(
    value: {
      acceptedAt: Date | null;
      revokedAt: Date | null;
      expiresAt: Date;
      company: { status: string; archivedAt: Date | null };
    } | null,
  ) {
    if (
      !value ||
      value.acceptedAt ||
      value.revokedAt ||
      value.expiresAt <= new Date() ||
      value.company.archivedAt ||
      value.company.status === "ARCHIVED" ||
      value.company.status === "SUSPENDED"
    )
      throw new AuthError(
        400,
        "INVITATION_INVALID",
        "Invitation expir�e, r�voqu�e ou indisponible. Contactez l'administrateur.",
      );
  }
  async accept(raw: string, fullName: string, password: string) {
    const target = await this.db.companyInvitation.findUnique({
      where: { tokenHash: tokenHash(raw) },
      select: { kind: true },
    });
    if (target?.kind === "STAFF")
      return new OrganizationService(this.db).accept(raw, {
        fullName,
        password,
      });
    const hash = await hashPassword(password);
    try {
      return await serializable(this.db, async (tx) => {
        const first = await tx.companyInvitation.findUnique({
          where: { tokenHash: tokenHash(raw) },
        });
        if (!first)
          throw new AuthError(
            400,
            "INVITATION_INVALID",
            "Invitation indisponible.",
          );
        await this.lockCompany(tx, first.companyId);
        await tx.$queryRaw`SELECT id FROM CompanyInvitation WHERE id = ${first.id} FOR UPDATE`;
        const invitation = await tx.companyInvitation.findUnique({
          where: { id: first.id },
          include: { company: true },
        });
        this.assertInvitation(invitation);
        if (invitation!.tokenHash !== tokenHash(raw))
          throw new AuthError(
            400,
            "INVITATION_INVALID",
            "Cette invitation a �t� remplac�e.",
          );
        if (await tx.user.findUnique({ where: { email: invitation!.email } }))
          throw new AuthError(
            409,
            "EXISTING_USER",
            "Un compte existe d�j�. Votre administrateur doit associer ce compte existant.",
          );
        const role = await this.role(tx),
          user = await tx.user.create({
            data: {
              email: invitation!.email,
              fullName,
              passwordHash: hash,
              status: "ACTIVE",
              emailVerifiedAt: new Date(),
            },
          });
        await tx.companyMembership.create({
          data: {
            companyId: invitation!.companyId,
            userId: user.id,
            roleId: role.id,
            roleScope: "COMPANY",
          },
        });
        await tx.company.update({
          where: { id: invitation!.companyId },
          data: {
            ...(invitation!.isPrimary ? { primaryAdminUserId: user.id } : {}),
            version: { increment: 1 },
          },
        });
        await tx.companyInvitation.update({
          where: { id: invitation!.id },
          data: { acceptedAt: new Date(), version: { increment: 1 } },
        });
        await this.audit(
          tx,
          user.id,
          invitation!.companyId,
          "COMPANY_INVITATION_ACCEPTED",
          { invitedById: invitation!.createdById, userId: user.id },
          invitation!.id,
        );
        return {
          message:
            "Votre compte est activ�. Vous pouvez maintenant vous connecter.",
        };
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw new AuthError(
          409,
          "EXISTING_USER",
          "Un compte existe d�j� pour cette adresse.",
        );
      throw e;
    }
  }
}
