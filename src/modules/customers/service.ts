import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { serializable } from "../../database/transaction.js";
import {
  hashPassword,
  verifyPassword,
  opaqueToken,
  tokenHash,
} from "../auth/crypto.js";
import { AuthError } from "../auth/errors.js";
import { subscriptionMailer } from "../auth/smtp.js";

export const registration = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    fullName: z.string().trim().min(2).max(160),
    phone: z.string().trim().min(5).max(32),
    termsAccepted: z.literal(true),
  })
  .strict();
export const acceptance = z
  .object({
    token: z.string().min(32).max(200),
    password: z.string().min(12).max(128),
  })
  .strict();
const unavailable = () =>
  new AuthError(
    400,
    "REGISTRATION_UNAVAILABLE",
    "Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien d'inscription.",
  );
export class CustomerService {
  constructor(
    readonly db: PrismaClient,
    readonly mailer = subscriptionMailer(),
    readonly webUrl = process.env.WEB_APP_URL || "http://localhost:5173",
  ) {}
  async register(input: z.infer<typeof registration>) {
    const token = opaqueToken();
    const pending = await this.db.customerRegistration.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    try {
      await this.mailer.send(
        input.email,
        "Votre espace client DND Delivery",
        `Bonjour,\n\nVérifiez votre adresse e-mail et finalisez votre compte utilisateur :\n${this.webUrl}/inscription-client#token=${token}\n\nCe lien expire dans 24 heures. Si vous avez déjà un compte, utilisez votre mot de passe habituel. Vous pourrez ensuite vous connecter sur le Web ou dans l'application mobile. Ignorez ce message si vous n'avez pas demandé cette inscription.`,
        randomUUID() + "@dnd-delivery",
      );
    } catch {
      await this.db.customerRegistration.delete({ where: { id: pending.id } });
      throw new AuthError(
        503,
        "EMAIL_UNAVAILABLE",
        "L'e-mail n'a pas pu être envoyé. Réessayez dans quelques instants.",
      );
    }
    return {
      message:
        "Consultez votre e-mail pour vérifier votre adresse et définir votre mot de passe. Si vous avez déjà un compte, utilisez votre mot de passe habituel.",
    };
  }
  async accept(input: z.infer<typeof acceptance>) {
    // Password is chosen by the mailbox owner, never by the original requester.
    const hash = await hashPassword(input.password);
    await serializable(this.db, async (tx) => {
      const row = await tx.customerRegistration.findUnique({
        where: { tokenHash: tokenHash(input.token) },
      });
      if (!row || row.usedAt || row.expiresAt <= new Date())
        throw unavailable();
      let user = await tx.user.findUnique({ where: { email: row.email } });
      if (user) {
        if (
          user.status !== "ACTIVE" ||
          user.archivedAt ||
          !(await verifyPassword(user.passwordHash, input.password))
        )
          throw new AuthError(
            400,
            "EXISTING_ACCOUNT",
            "Pour ce compte existant, saisissez votre mot de passe habituel. Vous pouvez le réinitialiser depuis la connexion.",
          );
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            customerEnabled: true,
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          },
        });
      } else {
        user = await tx.user.create({
          data: {
            email: row.email,
            fullName: row.fullName,
            phone: row.phone,
            passwordHash: hash,
            customerEnabled: true,
            emailVerifiedAt: new Date(),
          },
        });
      }
      await tx.customerRegistration.updateMany({
        where: { email: row.email, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.order.updateMany({
        where: {
          customerUserId: null,
          recipientEmail: user.email,
          isDraft: false,
          archivedAt: null,
        },
        data: { customerUserId: user.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "CUSTOMER_ACCOUNT_ENABLED",
          entityType: "User",
          entityId: user.id,
        },
      });
    });
    return {
      message:
        "Votre compte utilisateur est prêt. Connectez-vous pour retrouver vos commandes.",
    };
  }
  async claim(userId: string) {
    return serializable(this.db, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (
        !user?.customerEnabled ||
        !user.emailVerifiedAt ||
        user.status !== "ACTIVE" ||
        user.archivedAt
      )
        throw new AuthError(
          403,
          "CUSTOMER_REQUIRED",
          "Activez votre espace client en vérifiant votre adresse e-mail.",
        );
      // Existing ownership is never reassigned by an email match.
      await tx.order.updateMany({
        where: {
          customerUserId: null,
          recipientEmail: user.email,
          isDraft: false,
          archivedAt: null,
        },
        data: { customerUserId: user.id },
      });
    });
  }
  async orders(userId: string, page: number) {
    await this.claim(userId);
    const where = {
      customerUserId: userId,
      isDraft: false,
      archivedAt: null,
      company: { status: "ACTIVE" as const, archivedAt: null },
    };
    const [items, total] = await Promise.all([
      this.db.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 20,
        take: 20,
        select: {
          publicNumber: true,
          status: true,
          createdAt: true,
          company: { select: { name: true } },
          collaboration: { select: { shop: { select: { name: true } } } },
        },
      }),
      this.db.order.count({ where }),
    ]);
    return {
      items: items.map((o) => ({
        reference: o.publicNumber,
        status: o.status,
        createdAt: o.createdAt,
        company: o.company.name,
        shop: o.collaboration.shop.name,
      })),
      total,
      page,
    };
  }
}
