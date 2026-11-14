import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { serializable } from "../../database/transaction.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import {
  authorizeGlobal,
  authorizeTenant,
} from "../authorization/tenant-access.js";
import { AuthError } from "../auth/errors.js";
import {
  digest,
  nextMonth,
  effectiveStatus,
  type declarationInput,
  type planInput,
} from "./rules.js";
import type { z } from "zod";
type Tx = Prisma.TransactionClient;
const fail = (code: string, message: string, status = 409) =>
  new AuthError(status, code, message);
export class SubscriptionService {
  constructor(
    readonly db: PrismaClient,
    readonly secret: string,
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
          "DUPLICATE_PAYMENT",
          "Une déclaration ou modification identique existe déjà. Rechargez la liste.",
        );
      throw e;
    }
  }
  async global(tx: Tx, actor: string) {
    await authorizeGlobal(
      authorizationStore(tx),
      actor,
      "subscriptions.validate",
    );
  }
  async tenant(
    tx: Tx,
    actor: string,
    companyId: string,
    permission = "subscriptions.read",
  ) {
    await authorizeTenant(
      authorizationStore(tx),
      { userId: actor, companyId },
      permission,
    );
  }
  async lock(tx: Tx, companyId: string) {
    await tx.$queryRaw`SELECT id FROM Company WHERE id=${companyId} FOR UPDATE`;
    const c = await tx.company.findUnique({ where: { id: companyId } });
    if (!c || c.archivedAt || c.status === "ARCHIVED")
      throw fail("COMPANY_UNAVAILABLE", "Entreprise indisponible.", 404);
    return c;
  }
  audit(
    tx: Tx,
    actorId: string | null,
    companyId: string | null,
    action: string,
    entityId: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    return tx.auditLog.create({
      data: {
        actorId,
        companyId,
        action,
        entityType: "Subscription",
        entityId,
        metadata,
      },
    });
  }
  async price(tx: Tx, now: Date) {
    const plan = await tx.subscriptionPlan.findUnique({
      where: { referenceSlot: 1 },
    });
    if (!plan?.active)
      throw fail(
        "PLAN_UNCONFIGURED",
        "Le tarif mensuel doit être configuré.",
        503,
      );
    const price = await tx.subscriptionPrice.findFirst({
      where: {
        planId: plan.id,
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!price)
      throw fail(
        "PRICE_UNCONFIGURED",
        "Aucun tarif applicable à cette date.",
        503,
      );
    return { plan, price };
  }
  async plan() {
    const plan = await this.db.subscriptionPlan.findUnique({
      where: { referenceSlot: 1 },
    });
    if (!plan) return { plan: null, current: null, history: [] };
    const history = await this.db.subscriptionPrice.findMany({
      where: { planId: plan.id },
      orderBy: { effectiveFrom: "desc" },
      take: 100,
    });
    const now = this.clock();
    const current = await this.db.subscriptionPrice.findFirst({
      where: {
        planId: plan.id,
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    return {
      plan,
      current,
      history,
    };
  }
  async updatePlan(actor: string, input: z.infer<typeof planInput>) {
    return this.transaction(async (tx) => {
      await this.global(tx, actor);
      let plan = await tx.subscriptionPlan.findUnique({
        where: { referenceSlot: 1 },
      });
      if (!plan) {
        plan = await tx.subscriptionPlan.create({
          data: { code: "reference", name: input.name, referenceSlot: 1 },
        });
      }
      await tx.$queryRaw`SELECT id FROM SubscriptionPlan WHERE id=${plan.id} FOR UPDATE`;
      const latest = await tx.subscriptionPrice.findFirst({
        where: { planId: plan.id },
        orderBy: { effectiveFrom: "desc" },
      });
      if ((latest?.id ?? null) !== input.expectedPriceId)
        throw fail(
          "PRICE_CONFLICT",
          "Le tarif a changé. Rechargez avant de modifier.",
        );
      const now = this.clock(),
        from = input.effectiveFrom ? new Date(input.effectiveFrom) : now;
      if (
        from < new Date(now.getTime() - 60000) ||
        from > new Date(now.getTime() + 366 * 86400000)
      )
        throw fail("PRICE_DATE", "Date d’application invalide.");
      if (latest && from <= latest.effectiveFrom)
        throw fail(
          "PRICE_DATE",
          "La date doit suivre la dernière version, y compris les tarifs programmés.",
        );
      if (latest)
        await tx.subscriptionPrice.update({
          where: { id: latest.id },
          data: { effectiveUntil: from },
        });
      const price = await tx.subscriptionPrice.create({
        data: {
          planId: plan.id,
          amount: input.amount,
          currency: input.currency,
          effectiveFrom: from,
        },
      });
      await tx.subscriptionPlan.update({
        where: { id: plan.id },
        data: { name: input.name },
      });
      await this.audit(
        tx,
        actor,
        null,
        "SUBSCRIPTION_PRICE_CHANGED",
        price.id,
        {
          amount: input.amount,
          currency: input.currency,
          effectiveFrom: from.toISOString(),
        },
      );
      return price;
    });
  }
  async company(companyId: string) {
    const now = this.clock();
    const [company, subscription, plan, pending] = await Promise.all([
      this.db.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { id: true, name: true, status: true },
      }),
      this.db.subscription.findUnique({ where: { companyId } }),
      this.plan(),
      this.db.subscriptionPayment.count({
        where: { companyId, status: "PENDING" },
      }),
    ]);
    const status = effectiveStatus(subscription, now);
    const currentPeriod = await this.db.subscriptionPeriod.findFirst({
      where: { companyId, startsAt: { lte: now } },
      orderBy: { startsAt: "desc" },
    });
    return {
      company,
      subscription,
      currentPeriod,
      status: status === "NONE" && pending ? "PENDING" : status,
      plan,
      daysRemaining: subscription?.expiresAt
        ? Math.max(
            0,
            Math.ceil(
              (subscription.expiresAt.getTime() - now.getTime()) / 86400000,
            ),
          )
        : 0,
      serverTime: now,
    };
  }
  async declare(
    actor: string,
    companyId: string,
    input: z.infer<typeof declarationInput>,
  ) {
    return this.transaction(async (tx) => {
      await this.lock(tx, companyId);
      await this.tenant(tx, actor, companyId, "subscriptions.declare");
      const now = this.clock(),
        paidAt = new Date(input.paidAt);
      if (paidAt > now || paidAt < new Date("2000-01-01T00:00:00Z"))
        throw fail(
          "PAYMENT_DATE",
          "La date déclarée doit être passée et postérieure à 2000.",
          400,
        );
      const existing = await tx.subscriptionPayment.findUnique({
        where: {
          companyId_idempotencyKey: {
            companyId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        if (
          !existing.amount.equals(input.amount) ||
          existing.currency !== input.currency ||
          existing.method !== input.method ||
          existing.externalReference !== input.externalReference ||
          existing.paidAt?.getTime() !== paidAt.getTime() ||
          existing.notes !== input.notes
        )
          throw fail(
            "IDEMPOTENCY_CONFLICT",
            "Cette clé correspond à une autre déclaration.",
          );
        return existing;
      }
      const { plan } = await this.price(tx, now);
      let sub = await tx.subscription.findUnique({ where: { companyId } });
      sub ??= await tx.subscription.create({
        data: { companyId, planId: plan.id },
      });
      if (sub.planId !== plan.id)
        throw fail(
          "PLAN_CONFLICT",
          "Le plan historique demande une intervention administrative.",
        );
      const duplicateKey = input.externalReference
        ? digest([
            input.method,
            input.externalReference.toUpperCase().replace(/\s+/g, ""),
          ])
        : digest([
            companyId,
            new Prisma.Decimal(input.amount).toFixed(4),
            input.currency,
            input.method,
            paidAt.toISOString(),
          ]);
      const payment = await tx.subscriptionPayment.create({
        data: {
          companyId,
          subscriptionId: sub.id,
          declaredById: actor,
          ...input,
          paidAt,
          duplicateKey,
        },
      });
      await this.audit(
        tx,
        actor,
        companyId,
        "SUBSCRIPTION_PAYMENT_DECLARED",
        payment.id,
        { amount: input.amount, currency: input.currency },
      );
      return payment;
    });
  }
  sign(payload: object) {
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return (
      data + "." + createHmac("sha256", this.secret).update(data).digest("hex")
    );
  }
  verify(token: string) {
    if (!/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token))
      throw fail("PREVIEW_INVALID", "Confirmation invalide.");
    const [data, sig] = token.split(".");
    const wanted = createHmac("sha256", this.secret)
      .update(data ?? "")
      .digest("hex");
    if (
      !sig ||
      sig.length !== wanted.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(wanted))
    )
      throw fail(
        "PREVIEW_INVALID",
        "Confirmation invalide. Rechargez le paiement.",
      );
    try {
      return JSON.parse(Buffer.from(data!, "base64url").toString()) as {
        paymentId: string;
        priceId: string;
        previousEnd: string | null;
        startsAt: string;
        endsAt: string;
        issuedAt: string;
      };
    } catch {
      throw fail("PREVIEW_INVALID", "Confirmation invalide.");
    }
  }
  async preview(paymentId: string) {
    const p = await this.db.subscriptionPayment.findUnique({
      where: { id: paymentId },
      include: {
        subscription: true,
        company: { select: { name: true, status: true } },
        declarer: { select: { userId: true } },
      },
    });
    if (!p) throw fail("PAYMENT_NOT_FOUND", "Déclaration introuvable.", 404);
    if (p.status !== "PENDING")
      throw fail("PAYMENT_PROCESSED", "Cette déclaration est déjà traitée.");
    const now = this.clock(),
      { price } = await this.price(this.db, now);
    if (!p.amount.equals(price.amount) || p.currency !== price.currency)
      throw fail(
        "PRICE_MISMATCH",
        "Montant ou devise différent du tarif applicable. Vérifiez le règlement hors plateforme; rejetez et faites corriger la déclaration.",
      );
    if (["SUSPENDED", "CANCELLED"].includes(p.subscription.status))
      throw fail(
        "SUBSCRIPTION_BLOCKED",
        "Abonnement suspendu ou résilié : décision administrative requise.",
      );
    const start =
      p.subscription.expiresAt && p.subscription.expiresAt > now
        ? p.subscription.expiresAt
        : now;
    const endsAt = nextMonth(start);
    return {
      payment: p,
      price,
      startsAt: start,
      endsAt,
      previewToken: this.sign({
        paymentId,
        priceId: price.id,
        previousEnd: p.subscription.expiresAt?.toISOString() ?? null,
        startsAt: start.toISOString(),
        endsAt: endsAt.toISOString(),
        issuedAt: now.toISOString(),
      }),
    };
  }
  async approve(actor: string, paymentId: string, token: string) {
    const preview = this.verify(token);
    return this.transaction(async (tx) => {
      await this.global(tx, actor);
      const first = await tx.subscriptionPayment.findUnique({
        where: { id: paymentId },
      });
      if (!first)
        throw fail("PAYMENT_NOT_FOUND", "Déclaration introuvable.", 404);
      await this.lock(tx, first.companyId);
      const p = await tx.subscriptionPayment.findUniqueOrThrow({
        where: { id: paymentId },
        include: { subscription: true },
      });
      if (p.status !== "PENDING")
        throw fail("PAYMENT_PROCESSED", "Cette déclaration est déjà traitée.");
      if (p.declaredById === actor)
        throw fail(
          "SELF_APPROVAL",
          "Vous ne pouvez pas valider votre propre déclaration.",
          403,
        );
      const now = this.clock(),
        { price } = await this.price(tx, now);
      if (
        preview.paymentId !== paymentId ||
        preview.priceId !== price.id ||
        preview.previousEnd !==
          (p.subscription.expiresAt?.toISOString() ?? null) ||
        now.getTime() - Date.parse(preview.issuedAt) > 300000 ||
        Date.parse(preview.issuedAt) > now.getTime()
      )
        throw fail(
          "PREVIEW_STALE",
          "La période ou le tarif a changé. Rechargez la confirmation.",
        );
      if (!p.amount.equals(price.amount) || p.currency !== price.currency)
        throw fail(
          "PRICE_MISMATCH",
          "Le montant doit correspondre au tarif mensuel applicable.",
        );
      if (["SUSPENDED", "CANCELLED"].includes(p.subscription.status))
        throw fail("SUBSCRIPTION_BLOCKED", "Abonnement suspendu ou résilié.");
      const start = new Date(preview.startsAt),
        end = nextMonth(start);
      if (end.toISOString() !== preview.endsAt)
        throw fail("PREVIEW_INVALID", "Période invalide.");
      const period = await tx.subscriptionPeriod.create({
        data: {
          companyId: p.companyId,
          subscriptionId: p.subscriptionId,
          planId: p.subscription.planId,
          priceId: price.id,
          paymentId: p.id,
          amountApplied: price.amount,
          currency: price.currency,
          startsAt: start,
          endsAt: end,
        },
      });
      await tx.subscriptionPayment.update({
        where: { id: p.id },
        data: { status: "APPROVED", validatedAt: now, validatedById: actor },
      });
      await tx.subscription.update({
        where: { id: p.subscriptionId },
        data: {
          status: "ACTIVE",
          startedAt: p.subscription.startedAt ?? start,
          expiresAt: end,
          lastActivatedAt: now,
        },
      });
      await tx.subscriptionEvent.create({
        data: {
          companyId: p.companyId,
          subscriptionId: p.subscriptionId,
          actorId: actor,
          status: "ACTIVE",
          reason: `Paiement externe confirmé ${p.id}`,
        },
      });
      await this.audit(
        tx,
        actor,
        p.companyId,
        "SUBSCRIPTION_RENEWED",
        period.id,
        {
          paymentId: p.id,
          priceId: price.id,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
        },
      );
      await this.enqueue(tx, p.companyId, "RENEWED", period.id, {
        endsAt: end.toISOString(),
      });
      return period;
    });
  }
  async reject(actor: string, paymentId: string, reason: string) {
    return this.transaction(async (tx) => {
      await this.global(tx, actor);
      const first = await tx.subscriptionPayment.findUnique({
        where: { id: paymentId },
      });
      if (!first)
        throw fail("PAYMENT_NOT_FOUND", "Déclaration introuvable.", 404);
      await this.lock(tx, first.companyId);
      const p = await tx.subscriptionPayment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      if (p.status !== "PENDING")
        throw fail("PAYMENT_PROCESSED", "Déclaration déjà traitée.");
      if (p.declaredById === actor)
        throw fail(
          "SELF_APPROVAL",
          "Votre propre déclaration doit être traitée par un autre administrateur.",
          403,
        );
      await tx.subscriptionPayment.update({
        where: { id: paymentId },
        data: {
          status: "REJECTED",
          duplicateKey: null,
          rejectionReason: reason,
          validatedAt: this.clock(),
          validatedById: actor,
        },
      });
      await this.audit(
        tx,
        actor,
        p.companyId,
        "SUBSCRIPTION_PAYMENT_REJECTED",
        p.id,
        { reason },
      );
      await this.enqueue(tx, p.companyId, "REJECTED", p.id, { reason });
      return { status: "REJECTED" };
    });
  }
  async enqueue(
    tx: Tx,
    companyId: string,
    event: string,
    sourceId: string,
    payload: Prisma.InputJsonObject,
  ) {
    const recipients = await tx.companyMembership.findMany({
      where: {
        companyId,
        active: true,
        role: { code: "company_admin" },
        user: { status: "ACTIVE", archivedAt: null },
      },
      select: { user: { select: { id: true, email: true } } },
    });
    for (const { user } of recipients)
      await tx.notification.upsert({
        where: { dedupeKey: `subscription:${event}:${sourceId}:${user.id}` },
        create: {
          companyId,
          recipientUserId: user.id,
          recipientAddress: user.email,
          channel: "EMAIL",
          sourceEvent: `SUBSCRIPTION_${event}`,
          sourceId,
          template: `SUBSCRIPTION_${event}`,
          payload,
          status: "PENDING",
          availableAt: this.clock(),
          dedupeKey: `subscription:${event}:${sourceId}:${user.id}`,
        },
        update: {},
      });
  }
}
