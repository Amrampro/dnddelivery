import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { serializable } from "../../database/transaction.js";
import { AuthError } from "../auth/errors.js";
import { hashPassword, opaqueToken, tokenHash } from "../auth/crypto.js";
import type { z } from "zod";
import * as v from "./validation.js";
type Tx = Prisma.TransactionClient;
export interface PartnerContext {
  actorId: string;
  scope: "SHOP" | "COMPANY";
  shopId?: string;
  companyId?: string;
}
export interface PartnerMailer {
  available(): boolean;
  send(to: string, link: string, name: string): Promise<void>;
}
const fail = (code: string, message: string, status = 403) =>
  new AuthError(status, code, message);
const userSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
} as const;
const companySelect = {
  id: true,
  reference: true,
  name: true,
  tradeName: true,
  email: true,
  phone: true,
  address: true,
  countryCode: true,
  city: true,
  logoKey: true,
} as const;
const shopSelect = {
  id: true,
  reference: true,
  name: true,
  legalName: true,
  description: true,
  email: true,
  phone: true,
  address: true,
  countryCode: true,
  city: true,
  district: true,
  logoKey: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;
const version = (current: number, input: number) => {
  if (current !== input)
    throw fail(
      "VERSION_CONFLICT",
      "Ces informations ont changé. Rechargez la page.",
      409,
    );
};
export class PartnerService {
  constructor(
    readonly db: PrismaClient,
    readonly mailer: PartnerMailer,
    readonly webUrl: string,
    readonly clock = () => new Date(),
  ) {}
  async transaction<T>(work: (tx: Tx) => Promise<T>) {
    try {
      return await serializable(this.db, work);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw fail(
          "PARTNER_DUPLICATE",
          "Cette boutique, cette affiliation ou cette demande existe déjà.",
          409,
        );
      throw e;
    }
  }
  async authorize(
    tx: Tx,
    c: PartnerContext,
    permission: string,
    write = false,
  ) {
    if (
      !(await tx.user.findFirst({
        where: { id: c.actorId, status: "ACTIVE", archivedAt: null },
      }))
    )
      throw fail("ACCESS_DENIED", "Accès refusé.");
    if (c.scope === "SHOP") {
      if (!c.shopId)
        throw fail("SHOP_CONTEXT_REQUIRED", "Sélectionnez votre boutique.");
      if (write)
        await tx.$queryRaw`SELECT id FROM Shop WHERE id=${c.shopId} FOR UPDATE`;
      const m = await tx.shopMembership.findFirst({
        where: {
          shopId: c.shopId,
          userId: c.actorId,
          active: true,
          shop: { status: "ACTIVE", archivedAt: null },
          role: { scope: "SHOP" },
        },
        include: {
          role: {
            include: {
              rolePermission_roleRecords: { include: { permission: true } },
            },
          },
        },
      });
      if (
        !m ||
        !m.role.rolePermission_roleRecords.some(
          (p) => p.permission.code === permission,
        )
      )
        throw fail(
          "ACCESS_DENIED",
          "Vous ne disposez pas de cette autorisation dans cette boutique.",
        );
    } else {
      if (!c.companyId)
        throw fail(
          "COMPANY_CONTEXT_REQUIRED",
          "Sélectionnez votre entreprise.",
        );
      if (write)
        await tx.$queryRaw`SELECT id FROM Company WHERE id=${c.companyId} FOR UPDATE`;
      const m = await tx.companyMembership.findFirst({
        where: {
          companyId: c.companyId,
          userId: c.actorId,
          active: true,
          company: { status: "ACTIVE", archivedAt: null },
          role: { scope: "COMPANY" },
        },
        include: {
          role: {
            include: {
              rolePermission_roleRecords: { include: { permission: true } },
            },
          },
        },
      });
      if (
        !m ||
        !m.role.rolePermission_roleRecords.some(
          (p) => p.permission.code === permission,
        )
      )
        throw fail(
          "ACCESS_DENIED",
          "Vous ne disposez pas de cette autorisation dans cette entreprise.",
        );
      if (write) await this.subscription(tx, c.companyId);
    }
  }
  async subscription(tx: Tx, companyId: string) {
    if (
      !(await tx.company.findFirst({
        where: { id: companyId, status: "ACTIVE", archivedAt: null },
      })) ||
      !(await tx.subscription.findFirst({
        where: {
          companyId,
          status: "ACTIVE",
          startedAt: { lte: this.clock() },
          expiresAt: { gt: this.clock() },
        },
      }))
    )
      throw fail(
        "SUBSCRIPTION_REQUIRED",
        "Cette entreprise ne dispose pas d’un abonnement actif.",
      );
  }
  audit(
    tx: Tx,
    c: PartnerContext,
    shopId: string,
    action: string,
    metadata: Prisma.InputJsonObject = {},
    companyId?: string,
  ) {
    return tx.auditLog.create({
      data: {
        actorId: c.actorId,
        companyId: companyId ?? (c.scope === "COMPANY" ? c.companyId : null),
        action: "PARTNER_" + action,
        entityType: "Shop",
        entityId: shopId,
        metadata,
      },
    });
  }
  profileDto(p: Prisma.ShopGetPayload<{ select: typeof shopSelect }>) {
    const { logoKey, ...rest } = p;
    return { ...rest, logoUrl: logoKey ? "/partners/profile/logo" : null };
  }
  async profile(c: PartnerContext) {
    await this.authorize(this.db, c, "shop.profile.read");
    return this.profileDto(
      await this.db.shop.findUniqueOrThrow({
        where: { id: c.shopId },
        select: shopSelect,
      }),
    );
  }
  async updateProfile(c: PartnerContext, input: z.infer<typeof v.profile>) {
    await this.transaction(async (tx) => {
      await this.authorize(tx, c, "shop.profile.write", true);
      const old = await tx.shop.findUniqueOrThrow({ where: { id: c.shopId } });
      version(old.version, input.version);
      const { version: unused, ...data } = input;
      void unused;
      await tx.shop.update({
        where: { id: c.shopId },
        data: { ...data, version: { increment: 1 } },
      });
      await this.audit(tx, c, c.shopId!, "PROFILE_UPDATED", {
        fields: Object.keys(data),
      });
    });
    return this.profile(c);
  }
  async setLogo(c: PartnerContext, key: string, n: number) {
    await this.transaction(async (tx) => {
      await this.authorize(tx, c, "shop.profile.write", true);
      const p = await tx.shop.findUniqueOrThrow({ where: { id: c.shopId } });
      version(p.version, n);
      await tx.shop.update({
        where: { id: p.id },
        data: { logoKey: key, version: { increment: 1 } },
      });
      await this.audit(tx, c, p.id, "LOGO_UPDATED");
    });
    return this.profile(c);
  }
  async users(c: PartnerContext, q: z.infer<typeof v.query>) {
    await this.authorize(this.db, c, "shop.users.read");
    const where: Prisma.ShopMembershipWhereInput = {
      shopId: c.shopId,
      ...(q.q
        ? {
            user: {
              OR: [
                { fullName: { contains: q.q } },
                { email: { contains: q.q } },
              ],
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.shopMembership.findMany({
        where,
        include: { user: { select: userSelect }, role: true },
        orderBy: { createdAt: "asc" },
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.db.shopMembership.count({ where }),
    ]);
    return {
      items: items.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role.code,
        roleCode: m.role.code,
        status: m.affiliationStatus,
        active: m.active,
        version: m.version,
        user: m.user,
        createdAt: m.createdAt,
      })),
      total,
      page: q.page,
      size: q.size,
    };
  }
  async changeUser(
    c: PartnerContext,
    userId: string,
    input: z.infer<typeof v.member>,
    reason?: string,
  ) {
    await this.transaction(async (tx) => {
      await this.authorize(tx, c, "shop.users.manage", true);
      const m = await tx.shopMembership.findUnique({
        where: { shopId_userId: { shopId: c.shopId!, userId } },
        include: { role: true },
      });
      if (!m) throw fail("MEMBER_NOT_FOUND", "Affiliation introuvable.", 404);
      version(m.version, input.version);
      if (m.role.code === "shop_owner")
        throw fail(
          "OWNER_PROTECTED",
          "Le propriétaire de la boutique ne peut pas être modifié, suspendu ou retiré.",
          409,
        );
      const role = await tx.role.findUniqueOrThrow({
        where: { code: input.role },
      });
      if (
        input.active &&
        !(await tx.user.findFirst({
          where: { id: userId, status: "ACTIVE", archivedAt: null },
        }))
      )
        throw fail("USER_INACTIVE", "Ce compte est inactif.", 409);
      await tx.shopMembership.update({
        where: { id: m.id },
        data: {
          roleId: role.id,
          active: input.active,
          affiliationStatus: input.active ? "ACTIVE" : "INACTIVE",
          version: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        c,
        c.shopId!,
        input.active ? "USER_UPDATED" : "USER_REMOVED",
        {
          userId,
          role: input.role,
          active: input.active,
          reason: reason ?? null,
        },
      );
    });
    return { message: "Affiliation mise à jour." };
  }
  async removeUser(
    c: PartnerContext,
    userId: string,
    input: z.infer<typeof v.version>,
  ) {
    if (!input.reason)
      throw fail("REASON_REQUIRED", "Indiquez le motif du retrait.", 400);
    const m = await this.db.shopMembership.findUnique({
      where: { shopId_userId: { shopId: c.shopId!, userId } },
      include: { role: true },
    });
    if (!m) throw fail("MEMBER_NOT_FOUND", "Affiliation introuvable.", 404);
    return this.changeUser(
      c,
      userId,
      {
        version: input.version,
        role: m.role.code as z.infer<typeof v.role>,
        active: false,
      },
      input.reason,
    );
  }
  async sendInvitation(id: string, raw: string) {
    const p = await this.db.shopInvitation.findUniqueOrThrow({ where: { id } });
    let status = "SENT";
    try {
      if (!this.mailer.available()) throw Error();
      await this.mailer.send(
        p.email,
        `${this.webUrl}/invitation-boutique#token=${encodeURIComponent(raw)}`,
        p.fullName,
      );
    } catch {
      status = "FAILED";
    }
    await this.db.shopInvitation.updateMany({
      where: { id, tokenHash: tokenHash(raw) },
      data: { deliveryStatus: status },
    });
    return status;
  }
  async prepare(
    tx: Tx,
    input: {
      kind: string;
      email: string;
      fullName: string;
      shopId?: string;
      companyId?: string;
      role?: string;
      senderId?: string;
      payload: Prisma.InputJsonObject;
    },
  ) {
    const raw = opaqueToken();
    const p = await tx.shopInvitation.create({
      data: {
        ...input,
        tokenHash: tokenHash(raw),
        expiresAt: new Date(this.clock().getTime() + 48 * 3600000),
      },
    });
    return { id: p.id, raw };
  }
  async register(input: z.infer<typeof v.registration>, deferDelivery = false) {
    const pending = await this.transaction(async (tx) => {
      const existing = await tx.shop.findFirst({
        where: {
          OR: [{ registrationKey: input.email }, { email: input.email }],
          archivedAt: null,
        },
      });
      if (existing) return null;
      const previous = await tx.shopInvitation.findFirst({
        where: {
          kind: "REGISTRATION",
          email: input.email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: this.clock() },
        },
      });
      if (previous) {
        const abandoned = previous.deliveryStatus === "PENDING" &&
          previous.updatedAt.getTime() <= this.clock().getTime() - 5 * 60000;
        if (previous.deliveryStatus !== "FAILED" && !abandoned) return null;
        const raw = opaqueToken();
        await tx.shopInvitation.update({
          where: { id: previous.id },
          data: {
            tokenHash: tokenHash(raw),
            deliveryStatus: "PENDING",
            expiresAt: new Date(this.clock().getTime() + 48 * 3600000),
          },
        });
        return { id: previous.id, raw };
      }
      const { website, termsAccepted, ...payload } = input;
      void website;
      void termsAccepted;
      return this.prepare(tx, {
        kind: "REGISTRATION",
        email: input.email,
        fullName: input.fullName,
        payload: { ...payload, termsVersion: "shop-registration-2026-10-28" },
      });
    });
    if (pending) {
      const sending = this.sendInvitation(pending.id, pending.raw);
      if (deferDelivery) void sending.catch(() => undefined);
      else await sending;
    }
    return {
      message:
        "Si cette adresse peut inscrire une boutique, une demande de vérification a été prise en compte.",
    };
  }
  async inviteUser(c: PartnerContext, input: z.infer<typeof v.invite>) {
    const prepared = await this.transaction(async (tx) => {
      await this.authorize(tx, c, "shop.users.manage", true);
      const user = await tx.user.findUnique({ where: { email: input.email } });
      if (
        user &&
        (await tx.shopMembership.findFirst({
          where: { shopId: c.shopId, userId: user.id, active: true },
        }))
      )
        throw fail(
          "MEMBER_EXISTS",
          "Cette personne est déjà associée à la boutique.",
          409,
        );
      if (
        await tx.shopInvitation.findFirst({
          where: {
            shopId: c.shopId,
            email: input.email,
            kind: "USER",
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: this.clock() },
          },
        })
      )
        throw fail(
          "INVITATION_EXISTS",
          "Une invitation est déjà en attente.",
          409,
        );
      const p = await this.prepare(tx, {
        ...input,
        kind: "USER",
        shopId: c.shopId,
        senderId: c.actorId,
        payload: {},
      });
      await this.audit(tx, c, c.shopId!, "USER_INVITED", {
        invitationId: p.id,
        role: input.role,
      });
      return p;
    });
    const deliveryStatus = await this.sendInvitation(prepared.id, prepared.raw);
    return { id: prepared.id, deliveryStatus, message: "Invitation préparée." };
  }
  async invitations(c: PartnerContext, q: z.infer<typeof v.query>) {
    await this.authorize(
      this.db,
      c,
      c.scope === "SHOP" ? "shop.users.read" : "partners.read",
    );
    const where = {
      ...(c.scope === "SHOP"
        ? { shopId: c.shopId }
        : { companyId: c.companyId }),
      ...(c.scope === "SHOP" ? { kind: "USER" } : { kind: "PARTNER" }),
    };
    const [items, total] = await Promise.all([
      this.db.shopInvitation.findMany({
        where,
        select: {
          id: true,
          kind: true,
          email: true,
          fullName: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          deliveryStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.db.shopInvitation.count({ where }),
    ]);
    return {
      items: items.map((p) => ({
        ...p,
        roleCode: p.role,
        status: p.acceptedAt
          ? "ACCEPTED"
          : p.revokedAt
            ? "REVOKED"
            : p.expiresAt <= this.clock()
              ? "EXPIRED"
              : "PENDING",
      })),
      total,
      page: q.page,
      size: q.size,
    };
  }
  async invitationAction(
    c: PartnerContext,
    id: string,
    action: "resend" | "revoke",
  ) {
    let raw: string | undefined;
    await this.transaction(async (tx) => {
      await this.authorize(
        tx,
        c,
        c.scope === "SHOP" ? "shop.users.manage" : "partners.manage",
        true,
      );
      const p = await tx.shopInvitation.findFirst({
        where: {
          id,
          ...(c.scope === "SHOP"
            ? { shopId: c.shopId, kind: "USER" }
            : { companyId: c.companyId, kind: "PARTNER" }),
        },
      });
      if (!p || p.acceptedAt || p.revokedAt)
        throw fail(
          "INVITATION_UNAVAILABLE",
          "Cette invitation n’est plus disponible.",
          409,
        );
      if (action === "resend") {
        raw = opaqueToken();
        await tx.shopInvitation.update({
          where: { id },
          data: {
            tokenHash: tokenHash(raw),
            deliveryStatus: "PENDING",
            expiresAt: new Date(this.clock().getTime() + 48 * 3600000),
          },
        });
      } else
        await tx.shopInvitation.update({
          where: { id },
          data: { revokedAt: this.clock() },
        });
      if (p.shopId)
        await this.audit(
          tx,
          c,
          p.shopId,
          "INVITATION_" + action.toUpperCase(),
          { invitationId: id },
        );
    });
    const deliveryStatus = raw ? await this.sendInvitation(id, raw) : undefined;
    return {
      message:
        action === "resend" ? "Invitation renvoyée." : "Invitation révoquée.",
      deliveryStatus,
    };
  }
  async inspect(raw: string) {
    const p = await this.db.shopInvitation.findUnique({
      where: { tokenHash: tokenHash(raw) },
    });
    if (!p || p.revokedAt || p.acceptedAt || p.expiresAt <= this.clock())
      throw fail(
        "INVITATION_INVALID",
        "Ce lien est expiré ou indisponible.",
        410,
      );
    return {
      kind: p.kind,
      email: p.email,
      name: p.fullName,
      fullName: p.fullName,
      existingAccount: !!(await this.db.user.findUnique({
        where: { email: p.email },
      })),
      requiresProfile: p.kind === "PARTNER",
      role: p.role,
      termsVersion: "shop-registration-2026-10-28",
    };
  }
  async accept(input: z.infer<typeof v.accept>, actorId?: string) {
    const hash = input.password
      ? await hashPassword(input.password)
      : undefined;
    return this.transaction(async (tx) => {
      const found = await tx.shopInvitation.findUnique({
        where: { tokenHash: tokenHash(input.token) },
      });
      if (!found)
        throw fail(
          "INVITATION_INVALID",
          "Ce lien est expiré ou indisponible.",
          410,
        );
      await tx.$queryRaw`SELECT id FROM ShopInvitation WHERE id=${found.id} FOR UPDATE`;
      const p = await tx.shopInvitation.findUniqueOrThrow({
        where: { id: found.id },
      });
      if (p.revokedAt || p.acceptedAt || p.expiresAt <= this.clock())
        throw fail(
          "INVITATION_INVALID",
          "Ce lien est expiré ou indisponible.",
          410,
        );
      let user = await tx.user.findUnique({ where: { email: p.email } });
      if (user) {
        if (
          !actorId ||
          user.id !== actorId ||
          user.status !== "ACTIVE" ||
          user.archivedAt
        )
          throw fail(
            "EXISTING_ACCOUNT_REQUIRED",
            "Connectez-vous au compte destinataire pour accepter.",
          );
      } else {
        if (actorId || !hash)
          throw fail(
            "PASSWORD_REQUIRED",
            "Choisissez un mot de passe pour votre compte.",
            400,
          );
        user = await tx.user.create({
          data: {
            email: p.email,
            fullName: input.fullName || p.fullName,
            passwordHash: hash,
            emailVerifiedAt: this.clock(),
          },
        });
      }
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: user.emailVerifiedAt ?? this.clock() },
      });
      let shopId = p.shopId;
      if (p.kind === "USER") {
        if (!p.senderId || !shopId)
          throw fail("INVITATION_INVALID", "Invitation incomplète.", 410);
        await this.authorize(
          tx,
          { actorId: p.senderId, scope: "SHOP", shopId },
          "shop.users.manage",
          true,
        );
        const role = await tx.role.findUniqueOrThrow({
          where: { code: p.role! },
        });
        const current = await tx.shopMembership.findUnique({
          where: { shopId_userId: { shopId, userId: user.id } },
          include: { role: true },
        });
        if (current?.role.code === "shop_owner")
          throw fail("OWNER_PROTECTED", "L'affiliation du propriétaire ne peut pas être remplacée par une invitation.", 409);
        if (current?.active)
          throw fail("MEMBER_EXISTS", "Cette personne est déjà affiliée.", 409);
        await tx.shopMembership.upsert({
          where: { shopId_userId: { shopId, userId: user.id } },
          create: { shopId, userId: user.id, roleId: role.id },
          update: {
            active: true,
            affiliationStatus: "ACTIVE",
            roleId: role.id,
            version: { increment: 1 },
          },
        });
      } else {
        if (
          await tx.shop.findFirst({
            where: {
              OR: [{ registrationKey: p.email }, { email: p.email }],
              archivedAt: null,
            },
          })
        )
          throw fail(
            "SHOP_EXISTS",
            "Une boutique utilise déjà cette adresse. Connectez-vous à son espace.",
            409,
          );
        const payload = { ...(p.payload as Prisma.JsonObject) };
        delete payload.termsVersion;
        delete payload.agencyIds;
        delete payload.observations;
        const fields = v.registration.parse({
          ...payload,
          ...(p.kind === "PARTNER" ? (input.profile ?? {}) : {}),
          email: p.email,
          fullName: input.fullName || p.fullName,
          termsAccepted: true,
          website: "",
        });
        const { fullName, termsAccepted, website, ...shop } = fields;
        void fullName;
        void termsAccepted;
        void website;
        const created = await tx.shop.create({
          data: {
            ...shop,
            reference: "BOUT-" + opaqueToken().slice(0, 12).toUpperCase(),
            registrationKey: p.email,
            termsAcceptedAt: this.clock(),
            termsVersion: "shop-registration-2026-10-28",
          },
        });
        shopId = created.id;
        const role = await tx.role.findUniqueOrThrow({
          where: { code: "shop_owner" },
        });
        await tx.shopMembership.create({
          data: { shopId, userId: user.id, roleId: role.id },
        });
        if (p.kind === "PARTNER") {
          if (!p.senderId || !p.companyId)
            throw fail("INVITATION_INVALID", "Invitation incomplète.", 410);
          await this.authorize(
            tx,
            { scope: "COMPANY", companyId: p.companyId, actorId: p.senderId },
            "partners.manage",
            true,
          );
          const invitationPayload = p.payload as Prisma.JsonObject;
          const ids = Array.isArray(invitationPayload.agencyIds)
            ? invitationPayload.agencyIds.filter(
                (x): x is string => typeof x === "string",
              )
            : [];
          if (
            ids.length !==
            (await tx.agency.count({
              where: {
                companyId: p.companyId,
                id: { in: ids },
                status: "ACTIVE",
                archivedAt: null,
              },
            }))
          )
            throw fail(
              "AGENCY_INVALID",
              "Les agences de cette invitation ne sont plus disponibles.",
              409,
            );
          const collaboration = await tx.companyShop.create({
            data: {
              companyId: p.companyId,
              shopId,
              origin: "COMPANY",
              initiatorUserId: p.senderId,
              requestedAt: this.clock(),
              allowedAgencyIds: ids,
              observations:
                typeof invitationPayload.observations === "string"
                  ? invitationPayload.observations
                  : null,
            },
          });
          await this.audit(
            tx,
            { actorId: user.id, scope: "SHOP", shopId },
            shopId,
            "REQUESTED",
            { collaborationId: collaboration.id, origin: "COMPANY" },
            p.companyId,
          );
          await this.enqueue(tx, collaboration.id, "REQUESTED");
        }
      }
      await tx.shopInvitation.update({
        where: { id: p.id },
        data: { acceptedAt: this.clock() },
      });
      await this.audit(
        tx,
        { actorId: user.id, scope: "SHOP", shopId: shopId! },
        shopId!,
        p.kind === "USER" ? "USER_JOINED" : "SHOP_CREATED",
        { invitationId: p.id, termsVersion: "shop-registration-2026-10-28" },
      );
      return {
        shopId,
        message:
          "Votre accès boutique est prêt. Connectez-vous ou actualisez vos espaces.",
      };
    });
  }
  async directory(c: PartnerContext, reference: string) {
    await this.authorize(
      this.db,
      c,
      c.scope === "SHOP" ? "shop.collaborations.read" : "partners.read",
    );
    if (c.scope === "SHOP") {
      const p = await this.db.company.findFirst({
        where: { reference, status: "ACTIVE", archivedAt: null },
        select: {
          id: true,
          reference: true,
          name: true,
          tradeName: true,
          city: true,
          countryCode: true,
        },
      });
      return { items: p ? [p] : [] };
    }
    const p = await this.db.shop.findFirst({
      where: { reference, status: "ACTIVE", archivedAt: null },
      select: {
        id: true,
        reference: true,
        name: true,
        city: true,
        countryCode: true,
      },
    });
    return { items: p ? [p] : [] };
  }
  async collaborations(
    c: PartnerContext,
    q: z.infer<typeof v.query>,
    incoming = false,
  ) {
    await this.authorize(
      this.db,
      c,
      c.scope === "SHOP" ? "shop.collaborations.read" : "partners.read",
    );
    const where: Prisma.CompanyShopWhereInput = {
      ...(c.scope === "SHOP"
        ? { shopId: c.shopId }
        : { companyId: c.companyId }),
      ...(q.status ? { status: q.status } : {}),
      ...(incoming ? { origin: "SHOP", status: "PENDING" } : {}),
      ...(q.direction
        ? {
            origin:
              q.direction === "sent"
                ? c.scope === "SHOP"
                  ? "SHOP"
                  : "COMPANY"
                : c.scope === "SHOP"
                  ? "COMPANY"
                  : "SHOP",
          }
        : {}),
      ...(q.q
        ? {
            OR: [
              { shop: { name: { contains: q.q } } },
              { company: { name: { contains: q.q } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.companyShop.findMany({
        where,
        orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.db.companyShop.count({ where }),
    ]);
    return {
      items: await Promise.all(rows.map((p) => this.detail(c, p.id, false))),
      total,
      page: q.page,
      size: q.size,
    };
  }
  async scoped(tx: Tx, c: PartnerContext, id: string) {
    const p = await tx.companyShop.findFirst({
      where: {
        id,
        ...(c.scope === "SHOP"
          ? { shopId: c.shopId }
          : { companyId: c.companyId }),
      },
    });
    if (!p)
      throw fail("COLLABORATION_NOT_FOUND", "Collaboration introuvable.", 404);
    return p;
  }
  async detail(c: PartnerContext, id: string, check = true) {
    if (check)
      await this.authorize(
        this.db,
        c,
        c.scope === "SHOP" ? "shop.collaborations.read" : "partners.read",
      );
    const p = await this.scoped(this.db, c, id);
    const [shop, company, history] = await Promise.all([
      this.db.shop.findUniqueOrThrow({
        where: { id: p.shopId },
        select: shopSelect,
      }),
      this.db.company.findUniqueOrThrow({
        where: { id: p.companyId },
        select: companySelect,
      }),
      this.db.auditLog.findMany({
        where: {
          companyId: p.companyId,
          entityType: "Shop",
          entityId: p.shopId,
          action: {
            in: [
              "PARTNER_REQUESTED",
              "PARTNER_ACCEPTED",
              "PARTNER_REJECTED",
              "PARTNER_SUSPENDED",
              "PARTNER_ENDED",
              "PARTNER_AGENCIES_UPDATED",
            ],
          },
        },
        select: {
          id: true,
          action: true,
          actorId: true,
          actor: { select: { fullName: true } },
          createdAt: true,
          metadata: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    const ids = Array.isArray(p.allowedAgencyIds)
      ? p.allowedAgencyIds.filter((x): x is string => typeof x === "string")
      : [];
    const agencies = await this.db.agency.findMany({
      where: {
        companyId: p.companyId,
        id: { in: ids },
        status: "ACTIVE",
        archivedAt: null,
      },
      select: { id: true, name: true, reference: true, city: true },
    });
    const { logoKey, ...companySafe } = company;
    const shopDto = this.profileDto(shop);
    const [stockLocations, openOrders, openDeliveries, openTransfers] =
      await Promise.all([
        this.db.stock.count({
          where: {
            companyId: p.companyId,
            shopId: p.shopId,
            OR: [
              { physicalQuantity: { gt: 0 } },
              { reservedQuantity: { gt: 0 } },
            ],
          },
        }),
        this.db.order.count({
          where: {
            companyId: p.companyId,
            shopId: p.shopId,
            status: {
              in: ["PENDING", "CONFIRMED", "PREPARING", "READY", "IN_DELIVERY"],
            },
          },
        }),
        this.db.delivery.count({
          where: {
            companyId: p.companyId,
            status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] },
            order: { shopId: p.shopId },
          },
        }),
        this.db.transferItem.count({
          where: {
            companyId: p.companyId,
            shopId: p.shopId,
            transfer: { status: { in: ["DRAFT", "IN_TRANSIT"] } },
          },
        }),
      ]);
    return {
      ...p,
      openOperations: {
        stockLocations,
        openOrders,
        openDeliveries,
        openTransfers,
      },
      shop: {
        ...shopDto,
        logoUrl: shop.logoKey
          ? c.scope === "SHOP"
            ? "/partners/profile/logo"
            : `/company/partners/${p.id}/shop-logo`
          : null,
      },
      company: {
        ...companySafe,
        logoUrl: logoKey
          ? c.scope === "SHOP"
            ? `/partners/collaborations/${p.id}/company-logo`
            : null
          : null,
      },
      agencies,
      history,
    };
  }
  async request(
    c: PartnerContext,
    input: z.infer<typeof v.request> | z.infer<typeof v.companyInvite>,
  ) {
    const result = await this.transaction(async (tx) => {
      await this.authorize(
        tx,
        c,
        c.scope === "SHOP" ? "shop.collaborations.manage" : "partners.manage",
        true,
      );
      let shopId = c.shopId,
        companyId = c.companyId;
      const shopInput = input as z.infer<typeof v.request>,
        companyInput = input as z.infer<typeof v.companyInvite>;
      if (c.scope === "SHOP") {
        const company = await tx.company.findFirst({
          where: {
            reference: shopInput.companyReference,
            status: "ACTIVE",
            archivedAt: null,
          },
        });
        if (!company)
          throw fail("COMPANY_NOT_FOUND", "Entreprise introuvable.", 404);
        companyId = company.id;
      } else {
        const shop = await tx.shop.findFirst({
          where: {
            reference: companyInput.shopReference,
            status: "ACTIVE",
            archivedAt: null,
          },
        });
        if (!shop)
          throw fail(
            "SHOP_NOT_FOUND",
            "Boutique introuvable. Utilisez son adresse pour préparer une inscription.",
            404,
          );
        shopId = shop.id;
      }
      await tx.$queryRaw`SELECT id FROM Company WHERE id=${companyId!} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM Shop WHERE id=${shopId!} FOR UPDATE`;
      await this.subscription(tx, companyId!);
      const existing = await tx.companyShop.findUnique({
        where: { companyId_shopId: { companyId: companyId!, shopId: shopId! } },
      });
      if (existing)
        throw fail(
          "COLLABORATION_EXISTS",
          "Cette collaboration existe déjà. Consultez sa fiche pour demander une nouvelle autorisation.",
          409,
        );
      const ids = c.scope === "COMPANY" ? (companyInput.agencyIds ?? []) : [];
      if (
        ids.length !==
        (await tx.agency.count({
          where: {
            companyId,
            id: { in: ids },
            status: "ACTIVE",
            archivedAt: null,
          },
        }))
      )
        throw fail("AGENCY_INVALID", "Agence non autorisée.", 400);
      const p = await tx.companyShop.create({
        data: {
          shopId: shopId!,
          companyId: companyId!,
          origin: c.scope,
          initiatorUserId: c.actorId,
          requestedAt: this.clock(),
          observations: input.observations,
          allowedAgencyIds: ids,
        },
      });
      await this.audit(
        tx,
        c,
        p.shopId,
        "REQUESTED",
        { collaborationId: p.id, origin: c.scope },
        p.companyId,
      );
      await this.enqueue(tx, p.id, "REQUESTED");
      return p.id;
    });
    return this.detail(c, result);
  }
  async invitePartner(
    c: PartnerContext,
    input: z.infer<typeof v.companyInvite>,
  ) {
    if (input.shopReference) return this.request(c, input);
    const prepared = await this.transaction(async (tx) => {
      await this.authorize(tx, c, "partners.manage", true);
      if (
        await tx.shop.findFirst({
          where: {
            OR: [{ email: input.email! }, { registrationKey: input.email! }],
            archivedAt: null,
          },
        })
      )
        throw fail(
          "SHOP_REFERENCE_REQUIRED",
          "Utilisez la référence de la boutique existante pour demander son accord.",
          409,
        );
      if (
        await tx.shopInvitation.findFirst({
          where: {
            companyId: c.companyId,
            email: input.email,
            kind: "PARTNER",
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: this.clock() },
          },
        })
      )
        throw fail(
          "INVITATION_EXISTS",
          "Une invitation est déjà en attente.",
          409,
        );
      const ids = input.agencyIds ?? [];
      if (
        ids.length !==
        (await tx.agency.count({
          where: {
            companyId: c.companyId,
            id: { in: ids },
            status: "ACTIVE",
            archivedAt: null,
          },
        }))
      )
        throw fail("AGENCY_INVALID", "Agence non autorisée.", 400);
      const p = await this.prepare(tx, {
        kind: "PARTNER",
        companyId: c.companyId,
        senderId: c.actorId,
        email: input.email!,
        fullName: input.shopName || "Votre boutique",
        payload: {
          name: input.shopName || "Votre boutique",
          email: input.email!,
          agencyIds: ids,
          observations: input.observations ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: c.companyId,
          actorId: c.actorId,
          action: "PARTNER_SHOP_INVITED",
          entityType: "ShopInvitation",
          entityId: p.id,
        },
      });
      return p;
    });
    const deliveryStatus = await this.sendInvitation(prepared.id, prepared.raw);
    return {
      id: prepared.id,
      deliveryStatus,
      message:
        "Invitation à inscrire la boutique préparée. La collaboration nécessitera ensuite son accord.",
    };
  }
  async action(
    c: PartnerContext,
    id: string,
    action: "request" | "accept" | "reject" | "suspend" | "terminate",
    input: z.infer<typeof v.version>,
  ) {
    await this.transaction(async (tx) => {
      await this.authorize(
        tx,
        c,
        c.scope === "SHOP" ? "shop.collaborations.manage" : "partners.manage",
        true,
      );
      const found = await this.scoped(tx, c, id);
      await tx.$queryRaw`SELECT id FROM CompanyShop WHERE id=${found.id} FOR UPDATE`;
      const p = await this.scoped(tx, c, id);
      version(p.version, input.version);
      const receiver = p.origin !== c.scope;
      if (action === "accept" || action === "reject") {
        if (p.status !== "PENDING" || !receiver)
          throw fail(
            "TRANSITION_DENIED",
            "Seul le destinataire peut décider de cette demande en attente.",
            409,
          );
      }
      if (
        action === "suspend" &&
        (c.scope !== "COMPANY" || p.status !== "ACTIVE")
      )
        throw fail(
          "TRANSITION_DENIED",
          "Seule l’entreprise peut suspendre une collaboration active.",
          409,
        );
      if (action === "terminate" && !["ACTIVE", "SUSPENDED"].includes(p.status))
        throw fail(
          "TRANSITION_DENIED",
          "Cette collaboration ne peut pas être terminée dans cet état.",
          409,
        );
      if (
        action === "request" &&
        !["REJECTED", "ENDED", "SUSPENDED"].includes(p.status)
      )
        throw fail(
          "TRANSITION_DENIED",
          "Une nouvelle autorisation n’est pas nécessaire dans cet état.",
          409,
        );
      if (["reject", "suspend", "terminate"].includes(action) && !input.reason)
        throw fail("REASON_REQUIRED", "Indiquez un motif.", 400);
      if (["accept", "request"].includes(action))
        await this.subscription(tx, p.companyId);
      const status =
        action === "accept"
          ? "ACTIVE"
          : action === "reject"
            ? "REJECTED"
            : action === "suspend"
              ? "SUSPENDED"
              : action === "terminate"
                ? "ENDED"
                : "PENDING";
      await tx.companyShop.update({
        where: { id },
        data: {
          status,
          version: { increment: 1 },
          decisionUserId: c.actorId,
          reason: input.reason ?? null,
          ...(action === "request"
            ? {
                origin: c.scope,
                initiatorUserId: c.actorId,
                requestedAt: this.clock(),
                acceptedAt: null,
                suspendedAt: null,
                endedAt: null,
              }
            : {}),
          ...(action === "accept"
            ? {
                acceptedAt: this.clock(),
                startedAt: p.startedAt ?? this.clock(),
                endedAt: null,
                suspendedAt: null,
              }
            : {}),
          ...(action === "suspend" ? { suspendedAt: this.clock() } : {}),
          ...(action === "terminate" ? { endedAt: this.clock() } : {}),
        },
      });
      await this.audit(
        tx,
        c,
        p.shopId,
        {
          request: "REQUESTED",
          accept: "ACCEPTED",
          reject: "REJECTED",
          suspend: "SUSPENDED",
          terminate: "ENDED",
        }[action],
        {
          collaborationId: id,
          from: p.status,
          to: status,
          reason: input.reason ?? null,
        },
        p.companyId,
      );
      await this.enqueue(
        tx,
        id,
        {
          request: "REQUESTED",
          accept: "ACCEPTED",
          reject: "REJECTED",
          suspend: "SUSPENDED",
          terminate: "ENDED",
        }[action],
      );
    });
    return this.detail(c, id);
  }
  async setAgencies(
    c: PartnerContext,
    id: string,
    input: { version: number; agencyIds: string[] },
  ) {
    if (c.scope !== "COMPANY")
      throw fail(
        "SCOPE_DENIED",
        "Seule l’entreprise peut définir les agences de stockage.",
      );
    await this.transaction(async (tx) => {
      await this.authorize(tx, c, "partners.manage", true);
      const p = await this.scoped(tx, c, id);
      version(p.version, input.version);
      if (!["PENDING", "ACTIVE"].includes(p.status))
        throw fail(
          "COLLABORATION_INACTIVE",
          "Définissez les agences sur une collaboration en attente ou active.",
          409,
        );
      const ids = [...new Set(input.agencyIds)];
      if (
        ids.length !==
        (await tx.agency.count({
          where: {
            companyId: p.companyId,
            id: { in: ids },
            status: "ACTIVE",
            archivedAt: null,
          },
        }))
      )
        throw fail(
          "AGENCY_INVALID",
          "Une agence ne fait pas partie des agences actives de cette entreprise.",
          400,
        );
      await tx.companyShop.update({
        where: { id },
        data: { allowedAgencyIds: ids, version: { increment: 1 } },
      });
      await this.audit(
        tx,
        c,
        p.shopId,
        "AGENCIES_UPDATED",
        { collaborationId: id, agencyIds: ids },
        p.companyId,
      );
    });
    return this.detail(c, id);
  }
  async history(c: PartnerContext, q: z.infer<typeof v.query>) {
    await this.authorize(
      this.db,
      c,
      c.scope === "SHOP" ? "shop.history.read" : "partners.read",
    );
    const where: Prisma.AuditLogWhereInput = {
      entityType: "Shop",
      action:
        c.scope === "SHOP"
          ? { startsWith: "PARTNER_" }
          : {
              in: [
                "PARTNER_REQUESTED",
                "PARTNER_ACCEPTED",
                "PARTNER_REJECTED",
                "PARTNER_SUSPENDED",
                "PARTNER_ENDED",
                "PARTNER_AGENCIES_UPDATED",
                "PARTNER_SHOP_INVITED",
              ],
            },
      ...(c.scope === "SHOP"
        ? { entityId: c.shopId }
        : { companyId: c.companyId }),
    };
    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          actorId: true,
          actor: { select: { fullName: true } },
          entityId: true,
          companyId: true,
          createdAt: true,
          metadata: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.db.auditLog.count({ where }),
    ]);
    return { items, total, page: q.page, size: q.size };
  }
  async enqueue(tx: Tx, id: string, event: string) {
    const p = await tx.companyShop.findUniqueOrThrow({
      where: { id },
      include: { shop: true, company: true },
    });
    const [company, shop] = await Promise.all([
      tx.companyMembership.findMany({
        where: {
          companyId: p.companyId,
          active: true,
          role: { code: "company_admin" },
          user: { status: "ACTIVE", archivedAt: null },
        },
        include: { user: true },
      }),
      tx.shopMembership.findMany({
        where: {
          shopId: p.shopId,
          active: true,
          user: { status: "ACTIVE", archivedAt: null },
        },
        include: { user: true },
      }),
    ]);
    for (const user of [...company, ...shop].map((m) => m.user)) {
      const key = `partner:${id}:${p.version}:${event}:${user.id}`;
      await tx.notification.upsert({
        where: { dedupeKey: key },
        create: {
          companyId: p.companyId,
          recipientUserId: user.id,
          channel: "EMAIL",
          recipientAddress: user.email,
          sourceEvent: "PARTNER_" + event,
          sourceId: id,
          template: "PARTNER_" + event,
          payload: {
            shopId: p.shopId,
            shopName: p.shop.name,
            companyName: p.company.tradeName || p.company.name,
            event,
          },
          availableAt: this.clock(),
          dedupeKey: key,
        },
        update: {},
      });
    }
  }
  async notifications(c: PartnerContext, q: z.infer<typeof v.query>) {
    await this.authorize(
      this.db,
      c,
      c.scope === "SHOP" ? "shop.notifications.read" : "partners.read",
    );
    const membership =
      c.scope === "SHOP"
        ? await this.db.companyShop.findMany({
            where: { shopId: c.shopId },
            select: { id: true },
          })
        : [];
    const where: Prisma.NotificationWhereInput = {
      recipientUserId: c.actorId,
      sourceEvent: { startsWith: "PARTNER_" },
      ...(c.scope === "SHOP"
        ? { sourceId: { in: membership.map((m) => m.id) } }
        : { companyId: c.companyId }),
    };
    const [items, total] = await Promise.all([
      this.db.notification.findMany({
        where,
        select: {
          id: true,
          sourceEvent: true,
          payload: true,
          createdAt: true,
          status: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.db.notification.count({ where }),
    ]);
    return { items, total, page: q.page, size: q.size };
  }
}
