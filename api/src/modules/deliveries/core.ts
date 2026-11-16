import { createHash, randomUUID } from "node:crypto";
import { invalidateConfirmation } from "../confirmation/hooks.js";
import { notifyAudience } from "../confirmation/internal-notifications.js";
import {
  Prisma,
  type PrismaClient,
  type Delivery,
  type OrderStatus,
} from "../../generated/prisma/client.js";
import { StockService } from "../stocks/service.js";
import {
  checkVersion,
  stockError,
  collaborationAgency,
  agencyWrite,
} from "../stocks/access.js";
import { assertDriverAssignable } from "../organization/access.js";
import {
  access,
  permission,
  agencyAllowed,
  expectPhase,
  type Context,
  type Kind,
} from "./access.js";
import { DeliveryReads, missionInclude, type Mission } from "./read.js";
import type { Action } from "./validation.js";
type Tx = Prisma.TransactionClient;
export type Change = {
  data: Prisma.DeliveryUncheckedUpdateInput;
  orderStatus?: OrderStatus;
  metadata?: Prisma.InputJsonObject;
  event?: string;
};
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : v;
export const fingerprint = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(v)))
    .digest("hex");
export class DeliveryCore extends DeliveryReads {
  readonly stock: StockService;
  constructor(db: PrismaClient) {
    super(db);
    this.stock = new StockService(db);
  }
  transaction<T>(work: (tx: Tx) => Promise<T>) {
    return this.stock.transaction(work);
  }
  async mutate<T extends Action>(
    c: Context,
    id: string,
    required: string,
    input: T,
    action: string,
    work: (tx: Tx, p: Mission, kind: Kind) => Promise<Change>,
    options: { safe?: boolean; agency?: false; handoverId?: string } = {},
  ) {
    if (!c.companyId || c.scope === "SHOP")
      throw stockError(
        "PERMISSION_DENIED",
        "Cette opération est réservée à l’équipe logistique.",
        403,
      );
    await this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Company WHERE id=${c.companyId!} FOR UPDATE`;
      const auth = await access(tx, c);
      if (!auth.permissions.includes(required))
        throw stockError(
          "PERMISSION_DENIED",
          "Cette opération n’est pas autorisée.",
          403,
        );
      let p: Mission;
      if (options.handoverId) {
        const handover = await tx.parcelHandover.findFirst({
          where: {
            id: options.handoverId,
            companyId: c.companyId,
            agencyId: c.agencyId,
            targetCourierId: c.actorId,
            deliveryId: id,
          },
        });
        if (!handover || auth.kind !== "driver")
          throw stockError("HANDOVER_DENIED", "Remise non autorisée.", 403);
        p = await tx.delivery.findUniqueOrThrow({
          where: { id },
          include: missionInclude,
        });
      } else p = await this.find(tx, c, id, auth.kind);
      const requestHash = fingerprint({
        id,
        action,
        actorId: c.actorId,
        input,
      });
      const replay = await tx.deliveryEvent.findUnique({
        where: {
          companyId_operationKey: {
            companyId: p.companyId,
            operationKey: input.operationKey,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== requestHash)
          throw stockError(
            "IDEMPOTENCY_MISMATCH",
            "Cette référence d’opération correspond à une autre action.",
          );
        return;
      }
      await permission(tx, c, required, id, options.safe);
      if (!p.phase)
        throw stockError(
          "LEGACY_DELIVERY",
          "Cette ancienne mission doit être examinée avant son activation.",
        );
      if (options.agency !== false) agencyAllowed(c, p.agencyId);
      checkVersion(p.version, input.version);
      const change = await work(tx, p, auth.kind);
      const updated = await tx.delivery.update({
        where: { id },
        data: { ...change.data, version: { increment: 1 } },
      });
      if (change.orderStatus)
        await tx.order.update({
          where: { id: p.orderId },
          data: { status: change.orderStatus, version: { increment: 1 } },
        });
      await this.record(
        tx,
        c,
        p,
        updated,
        change.event ?? action,
        input.operationKey,
        requestHash,
        input.reason,
        input.notes,
        change.metadata,
      );
    });
  }
  async record(
    tx: Tx,
    c: Context,
    old: Mission | undefined,
    next: Delivery,
    action: string,
    key: string,
    requestHash: string,
    reason?: string,
    notes?: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    const custody = (d: Delivery) => ({
      type: d.custodyType,
      agencyId: d.custodyAgencyId,
      userId: d.custodyUserId,
    });
    const event = await tx.deliveryEvent.create({
      data: {
        companyId: next.companyId,
        deliveryId: next.id,
        sequence: next.version,
        actorId: c.actorId,
        status: next.status,
        previousStatus: old?.status,
        fromPhase: old?.phase,
        toPhase: next.phase,
        action,
        agencyId: next.agencyId,
        fromCustody: old ? custody(old) : Prisma.DbNull,
        toCustody: custody(next),
        operationKey: key,
        requestHash,
        reason,
        notes,
        metadata,
      },
    });
    const order = await tx.order.findUniqueOrThrow({
      where: { id: next.orderId },
    });
    await tx.orderEvent.create({
      data: {
        companyId: next.companyId,
        orderId: order.id,
        actorId: c.actorId,
        status: order.status,
        previousStatus: old?.order.status,
        action: "DELIVERY_" + action,
        metadata: {
          deliveryId: next.id,
          phase: next.phase,
          parcelReference: next.parcelReference,
        },
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: next.companyId,
        agencyId: next.agencyId,
        actorId: c.actorId,
        action: "DELIVERY_" + action,
        entityType: "Delivery",
        entityId: next.id,
        metadata: {
          eventId: event.id,
          orderId: order.id,
          shopId: order.shopId,
          reference: event.id,
          reason: reason ?? null,
          ...metadata,
        },
      },
    });
    await this.notify(
      tx,
      next,
      old,
      event.id,
      action === "INCIDENT_RESOLVED" && metadata.decision === "RETRY"
        ? "RETRY"
        : action,
      order.publicNumber,
      order.recipientEmail,
      metadata,
    );
    await invalidateConfirmation(tx, old, next);
    if (old) await notifyAudience(tx, old, event.id, action);
  }
  async notify(
    tx: Tx,
    p: Delivery,
    old: Delivery | undefined,
    eventId: string,
    action: string,
    publicNumber: string,
    recipientEmail: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    const users = [
      ...new Set(
        [
          p.courierId,
          ...([
            "REASSIGNED",
            "HANDOVER_REQUESTED",
            "HANDOVER_ACCEPTED",
          ].includes(action)
            ? [old?.courierId]
            : []),
        ].filter((s): s is string => !!s),
      ),
    ];
    if (
      action.startsWith("HANDOVER_") &&
      typeof metadata.handoverId === "string"
    ) {
      const target = await tx.parcelHandover.findFirst({
        where: { deliveryId: p.id, id: metadata.handoverId },
      });
      if (target && !users.includes(target.targetCourierId))
        users.push(target.targetCourierId);
    }
    for (const userId of users) {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true },
      });
      await tx.notification.create({
        data: {
          companyId: p.companyId,
          recipientUserId: userId,
          channel: "PUSH",
          recipientAddress: userId,
          sourceEvent: "DELIVERY_" + action,
          sourceId: eventId,
          template: "delivery_event",
          payload: { publicNumber, deliveryId: p.id, event: action },
          dedupeKey: `delivery:${eventId}:push:${userId}`,
          availableAt: new Date(),
        },
      });
      if (
        [
          "ASSIGNED",
          "REASSIGNED",
          "HANDOVER_REQUESTED",
          "HANDOVER_ACCEPTED",
          "HANDOVER_REJECTED",
          "HANDOVER_CANCELLED",
        ].includes(action)
      )
        await tx.notification.create({
          data: {
            companyId: p.companyId,
            recipientUserId: userId,
            channel: "EMAIL",
            recipientAddress: user.email,
            sourceEvent: "DELIVERY_" + action,
            sourceId: eventId,
            template: "delivery_event",
            payload: { publicNumber, deliveryId: p.id, event: action },
            dedupeKey: `delivery:${eventId}:email:${userId}`,
            availableAt: new Date(),
          },
        });
    }
    if (
      [
        "ASSIGNED",
        "REASSIGNED",
        "PICKED_UP",
        "TRANSFER_DISPATCHED",
        "TRANSFER_RECEIVED",
        "FINAL_DISTRIBUTION",
        "ATTEMPT",
        "ATTEMPT_FAILED",
        "RETURN_STARTED",
        "RETURN_RECEIVED",
        "RETRY_SCHEDULED",
        "RETRY",
        "CANCELLED",
        "COMPLETED",
        "OTP_RENEWED",
      ].includes(action)
    )
      await tx.notification.create({
        data: {
          companyId: p.companyId,
          channel: "EMAIL",
          recipientAddress: recipientEmail,
          sourceEvent: "DELIVERY_" + action,
          sourceId: eventId,
          template: "delivery_event",
          payload: { publicNumber, deliveryId: p.id, event: action },
          dedupeKey: `delivery:${eventId}:recipient`,
          availableAt: new Date(),
        },
      });
  }
  assigned(c: Context, p: Mission) {
    if (
      c.actorId !== p.courierId ||
      c.companyId !== p.companyId ||
      !["COMPANY", "AGENCY"].includes(c.scope) ||
      (c.scope === "AGENCY" && c.agencyId !== p.agencyId) ||
      (p.custodyUserId && p.custodyUserId !== c.actorId)
    )
      throw stockError(
        "MISSION_NOT_ASSIGNED",
        "Cette mission ne vous est pas attribuée.",
        403,
      );
  }
  async noPending(tx: Tx, p: Mission) {
    if (
      (await tx.parcelHandover.count({
        where: { deliveryId: p.id, status: "PENDING" },
      })) ||
      (await tx.parcelLeg.count({
        where: { deliveryId: p.id, status: { in: ["DRAFT", "IN_TRANSIT"] } },
      }))
    )
      throw stockError(
        "CUSTODY_PENDING",
        "Terminez ou annulez la remise/l’étape de transport en cours.",
      );
  }
  async closeAssignment(tx: Tx, p: Mission) {
    await tx.deliveryAssignment.updateMany({
      where: { companyId: p.companyId, deliveryId: p.id, endedAt: null },
      data: { endedAt: new Date(), activeSlot: null },
    });
  }
  async assignRecord(
    tx: Tx,
    c: Context,
    p: Mission,
    courierId: string,
    reason?: string,
    purpose = "FINAL",
    assignerId = c.actorId,
  ) {
    await this.closeAssignment(tx, p);
    await tx.deliveryAssignment.create({
      data: {
        companyId: p.companyId,
        deliveryId: p.id,
        agencyId: p.agencyId,
        courierId,
        assignedById: assignerId,
        reason,
        purpose,
        activeSlot: 1,
        expectedAmountSnapshot: p.order.amountToCollect,
        currencySnapshot: p.order.currency,
        collectionRequiredSnapshot: p.order.collectionRequired,
      },
    });
  }
  async consume(tx: Tx, c: Context, p: Mission) {
    if (p.order.type !== "FROM_STOCK" || p.stockIssuedAt) return false;
    if (
      p.custodyType !== "AGENCY" ||
      p.custodyAgencyId !== p.order.agencyId ||
      p.agencyId !== p.order.agencyId
    )
      throw stockError(
        "STOCK_CUSTODY_INVALID",
        "La remise doit être confirmée dans l’agence détentrice du stock.",
      );
    for (const item of p.order.orderItem_orderRecords) {
      const rows = await tx.stockReservation.findMany({
        where: {
          companyId: p.companyId,
          orderItemId: item.id,
          status: "ACTIVE",
        },
        include: { stock: true },
      });
      if (
        rows.reduce((sum, r) => sum + r.quantity, 0) !== item.quantity ||
        !rows.length
      )
        throw stockError(
          "RESERVATION_INVALID",
          "Les articles ne disposent plus de leurs réservations exactes.",
        );
      for (const r of rows) {
        if (
          r.stock.agencyId !== p.agencyId ||
          r.shopId !== p.order.shopId ||
          r.productId !== item.productId
        )
          throw stockError(
            "RESERVATION_INVALID",
            "Réservation hors du périmètre de la mission.",
            403,
          );
        await this.stock.movement(
          tx,
          c,
          r.stockId,
          "ISSUE",
          -r.quantity,
          -r.quantity,
          `delivery-pickup:${r.id}`,
          `Prise en charge ${p.parcelReference}`,
          { reservationId: r.id },
        );
        await tx.stockReservation.update({
          where: { id: r.id },
          data: {
            status: "CONSUMED",
            consumedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }
    }
    return true;
  }
  async create(
    c: Context,
    input: { orderId: string; orderVersion: number; operationKey: string },
  ) {
    if (!c.companyId || c.scope === "SHOP")
      throw stockError(
        "PERMISSION_DENIED",
        "Création de mission non autorisée.",
        403,
      );
    const id = await this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Company WHERE id=${c.companyId!} FOR UPDATE`;
      await permission(tx, c, "deliveries.assign");
      const o = await tx.order.findFirst({
        where: {
          id: input.orderId,
          companyId: c.companyId,
          ...(c.scope === "AGENCY" ? { agencyId: c.agencyId } : {}),
        },
      });
      if (!o) throw stockError("ORDER_NOT_FOUND", "Commande introuvable.", 404);
      const requestHash = fingerprint({
        input,
        actorId: c.actorId,
        action: "CREATED",
      });
      const replay = await tx.deliveryEvent.findUnique({
        where: {
          companyId_operationKey: {
            companyId: c.companyId!,
            operationKey: input.operationKey,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== requestHash)
          throw stockError(
            "IDEMPOTENCY_MISMATCH",
            "Opération différente sous cette référence.",
          );
        return replay.deliveryId;
      }
      checkVersion(o.version, input.orderVersion);
      if (
        o.isDraft ||
        o.status !== "PENDING" ||
        (await tx.delivery.count({ where: { orderId: o.id } }))
      )
        throw stockError(
          "ORDER_NOT_DISPATCHABLE",
          "Cette commande ne peut pas créer une nouvelle mission.",
        );
      await agencyWrite(tx, c, o.agencyId);
      await collaborationAgency(tx, o.companyId, o.shopId, [o.agencyId]);
      const p = await tx.delivery.create({
        data: {
          companyId: o.companyId,
          orderId: o.id,
          agencyId: o.agencyId,
          parcelReference: `COLIS-${randomUUID().toUpperCase()}`,
          phase: o.type === "FROM_STOCK" ? "AT_AGENCY" : "WAITING_COLLECTION",
          custodyType: o.type === "FROM_STOCK" ? "AGENCY" : "SHOP",
          custodyAgencyId: o.type === "FROM_STOCK" ? o.agencyId : null,
        },
      });
      await this.record(
        tx,
        c,
        undefined,
        p,
        "CREATED",
        input.operationKey,
        requestHash,
      );
      return p.id;
    });
    return this.detail(c, id);
  }
  async assign(
    c: Context,
    id: string,
    input: Action & { courierId: string },
    reassign = false,
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.assign",
      input,
      reassign ? "REASSIGNED" : "ASSIGNED",
      async (tx, p) => {
        expectPhase(p, [
          "WAITING_COLLECTION",
          "AT_AGENCY",
          "PREPARED",
          "WITH_COURIER",
          "IN_TRANSIT",
          "FINAL_DISTRIBUTION",
          "AT_DESTINATION",
          "FAILED",
        ]);
        if (p.parcelReturn)
          throw stockError(
            "RETURN_IN_PROGRESS",
            "Le retour doit être traité avant toute nouvelle affectation.",
          );
        if (reassign && !input.reason)
          throw stockError(
            "REASON_REQUIRED",
            "Indiquez le motif de réaffectation.",
            400,
          );
        if (
          (!reassign && p.courierId) ||
          (reassign && !p.courierId) ||
          p.courierId === input.courierId
        )
          throw stockError(
            "ASSIGNMENT_CONFLICT",
            "Choisissez une nouvelle affectation cohérente.",
          );
        await this.noPending(tx, p);
        await assertDriverAssignable(
          tx,
          p.companyId,
          p.agencyId,
          input.courierId,
        );
        await collaborationAgency(tx, p.companyId, p.order.shopId, [
          p.agencyId,
        ]);
        if (p.custodyType === "COURIER" || p.custodyType === "TRANSPORT") {
          if (p.custodyUserId !== p.courierId)
            throw stockError(
              "CUSTODY_CONFLICT",
              "Le détenteur doit confirmer sa remise avant réaffectation.",
            );
          const h = await tx.parcelHandover.create({
            data: {
              companyId: p.companyId,
              deliveryId: p.id,
              agencyId: p.agencyId,
              fromCourierId: p.courierId!,
              targetCourierId: input.courierId,
              createdById: c.actorId,
              reason: input.reason!,
              activeSlot: 1,
            },
          });
          return {
            data: {},
            event: "HANDOVER_REQUESTED",
            metadata: { handoverId: h.id, targetCourierId: input.courierId },
          };
        }
        await this.assignRecord(tx, c, p, input.courierId, input.reason);
        return {
          data: {
            courierId: input.courierId,
            assignedAt: new Date(),
            status: "ASSIGNED",
          },
          orderStatus: p.order.status === "PENDING" ? "CONFIRMED" : undefined,
          metadata: { courierId: input.courierId },
        };
      },
    );
    return this.detail(c, id);
  }
  async confirmHandover(
    c: Context,
    id: string,
    handoverId: string,
    input: Action & { condition: string; handoverVersion: number },
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.handover.accept",
      input,
      "HANDOVER_ACCEPTED",
      async (tx, p) => {
        const h = await tx.parcelHandover.findUniqueOrThrow({
          where: { id: handoverId },
        });
        checkVersion(h.version, input.handoverVersion);
        if (
          h.status !== "PENDING" ||
          h.targetCourierId !== c.actorId ||
          h.fromCourierId !== p.custodyUserId ||
          p.courierId !== h.fromCourierId
        )
          throw stockError(
            "HANDOVER_CONFLICT",
            "Cette remise n’est plus disponible.",
          );
        if (input.condition === "REFUSED") {
          await tx.parcelHandover.update({
            where: { id: h.id },
            data: {
              status: "REJECTED",
              activeSlot: null,
              condition: "REFUSED",
              confirmedById: c.actorId,
              confirmedAt: new Date(),
              version: { increment: 1 },
            },
          });
          return {
            data: {},
            event: "HANDOVER_REJECTED",
            metadata: { handoverId: h.id },
          };
        }
        await assertDriverAssignable(tx, p.companyId, p.agencyId, c.actorId);
        await this.assignRecord(
          tx,
          c,
          p,
          c.actorId,
          h.reason,
          "FINAL",
          h.createdById,
        );
        await tx.parcelHandover.update({
          where: { id: h.id },
          data: {
            status: "ACCEPTED",
            activeSlot: null,
            condition: input.condition,
            confirmedById: c.actorId,
            confirmedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (input.condition === "DAMAGED")
          await this.openIncident(
            tx,
            c,
            p,
            "DAMAGED",
            "Colis endommagé lors de la remise de garde.",
            true,
          );
        return {
          data: {
            courierId: c.actorId,
            custodyUserId: c.actorId,
            custodyType: "COURIER",
            assignedAt: new Date(),
            ...(input.condition === "DAMAGED"
              ? {
                  status: "FAILED",
                  phase: "FAILED",
                  failureReason: "DAMAGED",
                  closedAt: new Date(),
                }
              : {}),
          },
          orderStatus: input.condition === "DAMAGED" ? "FAILED" : undefined,
          metadata: { handoverId: h.id, condition: input.condition },
        };
      },
      { handoverId },
    );
    return { deliveryId: id };
  }
  async prepare(c: Context, id: string, input: Action) {
    await this.mutate(
      c,
      id,
      "deliveries.prepare",
      input,
      "PREPARED",
      async (tx, p) => {
        expectPhase(p, ["AT_AGENCY"]);
        if (p.custodyType !== "AGENCY")
          throw stockError(
            "CUSTODY_CONFLICT",
            "Le colis doit être présent en agence.",
          );
        await this.noPending(tx, p);
        await collaborationAgency(tx, p.companyId, p.order.shopId, [
          p.agencyId,
        ]);
        return {
          data: { phase: "PREPARED" },
          orderStatus: p.pickedUpAt ? undefined : "READY",
        };
      },
    );
    return this.detail(c, id);
  }
  async pickup(c: Context, id: string, input: Action) {
    await this.mutate(
      c,
      id,
      "deliveries.pickup",
      input,
      "PICKED_UP",
      async (tx, p) => {
        this.assigned(c, p);
        await this.noPending(tx, p);
        expectPhase(
          p,
          p.order.type === "FROM_STOCK" && !p.stockIssuedAt
            ? ["PREPARED"]
            : ["WAITING_COLLECTION", "AT_AGENCY", "PREPARED"],
        );
        if (p.custodyType !== "SHOP" && p.custodyType !== "AGENCY")
          throw stockError(
            "CUSTODY_CONFLICT",
            "Le colis a déjà été pris en charge.",
          );
        await collaborationAgency(tx, p.companyId, p.order.shopId, [
          p.agencyId,
        ]);
        const issued = await this.consume(tx, c, p);
        return {
          data: {
            status: "IN_PROGRESS",
            phase: "WITH_COURIER",
            pickedUpAt: p.pickedUpAt ?? new Date(),
            custodyType: "COURIER",
            custodyAgencyId: p.agencyId,
            custodyUserId: c.actorId,
            ...(issued ? { stockIssuedAt: new Date() } : {}),
          },
          orderStatus: "IN_DELIVERY",
          metadata: { stockIssued: issued },
        };
      },
    );
    return this.detail(c, id);
  }
  async progress(c: Context, id: string, input: Action & { event: string }) {
    await this.mutate(
      c,
      id,
      "deliveries.progress",
      input,
      input.event,
      async (tx, p) => {
        this.assigned(c, p);
        if (!p.pickedUpAt || p.custodyUserId !== c.actorId)
          throw stockError(
            "PICKUP_REQUIRED",
            "Confirmez d’abord la prise en charge physique.",
          );
        await this.noPending(tx, p);
        const rules: Record<string, { from: string[]; phase: string }> = {
          DEPARTED: { from: ["WITH_COURIER"], phase: "IN_TRANSIT" },
          ARRIVED_AGENCY: {
            from: ["WITH_COURIER", "IN_TRANSIT"],
            phase: "ARRIVED_AGENCY",
          },
          FINAL_DISTRIBUTION: {
            from: ["WITH_COURIER", "IN_TRANSIT"],
            phase: "FINAL_DISTRIBUTION",
          },
          ARRIVED: { from: ["FINAL_DISTRIBUTION"], phase: "AT_DESTINATION" },
          RETURN_STARTED: { from: ["RETURN_REQUESTED"], phase: "RETURNING" },
          RETURN_ARRIVED: { from: ["RETURNING"], phase: "RETURN_ARRIVED" },
        };
        const rule = rules[input.event];
        if (!rule)
          throw stockError(
            "PROOF_REQUIRED",
            "Utilisez le parcours de confirmation OTP et preuves pour clôturer la remise.",
          );
        expectPhase(p, rule.from);
        if (input.event.startsWith("RETURN_") && !p.parcelReturn)
          throw stockError(
            "RETURN_REQUIRED",
            "Une décision de retour est nécessaire.",
          );
        if (input.event === "RETURN_STARTED")
          await tx.deliveryReturn.update({
            where: {
              companyId_deliveryId: { companyId: p.companyId, deliveryId: id },
            },
            data: { status: "IN_TRANSIT" },
          });
        return { data: { phase: rule.phase } };
      },
      { safe: true },
    );
    return this.detail(c, id);
  }
  async openIncident(
    tx: Tx,
    c: Context,
    p: Mission,
    kind: string,
    description: string,
    blocking: boolean,
  ) {
    return tx.deliveryIncident.create({
      data: {
        companyId: p.companyId,
        deliveryId: p.id,
        agencyId: p.agencyId,
        actorId: c.actorId,
        kind,
        description,
        blocking,
      },
    });
  }
  async attempt(
    c: Context,
    id: string,
    input: Action & { result: string; kind?: string },
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.attempt",
      input,
      input.result === "FAILED" ? "ATTEMPT_FAILED" : "ATTEMPT",
      async (tx, p) => {
        this.assigned(c, p);
        await this.noPending(tx, p);
        expectPhase(
          p,
          input.result === "FAILED"
            ? [
                "WITH_COURIER",
                "IN_TRANSIT",
                "FINAL_DISTRIBUTION",
                "AT_DESTINATION",
                "AWAITING_PROOF",
              ]
            : ["AT_DESTINATION"],
        );
        if (p.custodyUserId !== c.actorId)
          throw stockError(
            "CUSTODY_CONFLICT",
            "Vous ne détenez pas ce colis.",
            403,
          );
        if (input.result === "FAILED" && (!input.kind || !input.reason))
          throw stockError(
            "REASON_REQUIRED",
            "Un motif d’échec est obligatoire.",
            400,
          );
        const a = await tx.deliveryAttempt.create({
          data: {
            companyId: p.companyId,
            deliveryId: id,
            courierId: c.actorId,
            result: input.result,
            reason: input.kind,
            notes: input.reason ?? input.notes,
          },
        });
        if (input.result === "FAILED")
          await this.openIncident(tx, c, p, input.kind!, input.reason!, true);
        return {
          data:
            input.result === "FAILED"
              ? {
                  status: "FAILED",
                  phase: "FAILED",
                  failureReason: input.kind,
                  closedAt: new Date(),
                }
              : { phase: "AWAITING_PROOF" },
          orderStatus: input.result === "FAILED" ? "FAILED" : undefined,
          metadata: {
            attemptId: a.id,
            result: input.result,
            kind: input.kind ?? null,
          },
        };
      },
      { safe: true },
    );
    return this.detail(c, id);
  }
  async incident(
    c: Context,
    id: string,
    input: Action & { kind: string; description: string; blocking: boolean },
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.incident.report",
      input,
      "INCIDENT",
      async (tx, p, kind) => {
        if (kind === "driver") this.assigned(c, p);
        expectPhase(p, [
          "WAITING_COLLECTION",
          "AT_AGENCY",
          "PREPARED",
          "WITH_COURIER",
          "IN_TRANSIT",
          "INTER_AGENCY_TRANSIT",
          "FINAL_DISTRIBUTION",
          "AT_DESTINATION",
          "AWAITING_PROOF",
          "FAILED",
          "RETURN_REQUESTED",
          "RETURNING",
          "RETURN_ARRIVED",
        ]);
        const incident = await this.openIncident(
          tx,
          c,
          p,
          input.kind,
          input.description,
          input.blocking,
        );
        return {
          data: input.blocking
            ? {
                status: "FAILED",
                phase: "FAILED",
                closedAt: new Date(),
                failureReason: input.kind,
              }
            : {},
          orderStatus: input.blocking ? "FAILED" : undefined,
          metadata: {
            incidentId: incident.id,
            kind: input.kind,
            blocking: input.blocking,
          },
        };
      },
      { safe: true },
    );
    return this.detail(c, id);
  }
}
