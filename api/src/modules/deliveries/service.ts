import { Prisma } from "../../generated/prisma/client.js";
import { AuthError } from "../auth/errors.js";
import { DeliveryCore, type Change } from "./core.js";
import type { Mission } from "./read.js";
import {
  agencyAllowed,
  expectPhase,
  permission,
  access,
  type Context,
} from "./access.js";
import {
  checkVersion,
  stockError,
  collaborationAgency,
  agencyWrite,
} from "../stocks/access.js";
import { assertDriverAssignable } from "../organization/access.js";
import type { Action } from "./validation.js";
type Tx = Prisma.TransactionClient;
export class DeliveryService extends DeliveryCore {
  async cancelHandover(
    c: Context,
    id: string,
    handoverId: string,
    input: Action,
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.assign",
      { ...input, handoverId },
      "HANDOVER_CANCELLED",
      async (tx, p) => {
        if (!input.reason)
          throw stockError(
            "REASON_REQUIRED",
            "Justifiez l’annulation de la proposition de remise.",
            400,
          );
        const h = await tx.parcelHandover.findFirst({
          where: {
            id: handoverId,
            deliveryId: id,
            companyId: p.companyId,
            status: "PENDING",
          },
        });
        if (!h)
          throw stockError(
            "HANDOVER_NOT_PENDING",
            "Aucune proposition de remise à annuler.",
          );
        await tx.parcelHandover.update({
          where: { id: h.id },
          data: {
            status: "CANCELLED",
            activeSlot: null,
            confirmedById: c.actorId,
            confirmedAt: new Date(),
            version: { increment: 1 },
          },
        });
        return { data: {}, metadata: { handoverId: h.id } };
      },
      { safe: true },
    );
    return this.detail(c, id);
  }
  async receiveAgency(
    c: Context,
    id: string,
    input: Action & { condition: string },
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.receive",
      input,
      "AGENCY_RECEIVED",
      async (tx, p) => {
        expectPhase(p, ["ARRIVED_AGENCY"]);
        if (p.custodyType !== "COURIER" || !p.custodyUserId)
          throw stockError(
            "CUSTODY_CONFLICT",
            "Aucun livreur détenteur à réceptionner.",
          );
        if (input.condition === "REFUSED") {
          if (!input.reason)
            throw stockError(
              "REASON_REQUIRED",
              "Précisez le refus de réception.",
              400,
            );
          await this.openIncident(tx, c, p, "REFUSED", input.reason, true);
          return {
            data: {
              status: "FAILED",
              phase: "FAILED",
              closedAt: new Date(),
              failureReason: "REFUSED",
            },
            orderStatus: "FAILED",
            metadata: { condition: input.condition },
          };
        }
        await this.noPending(tx, p);
        await this.closeAssignment(tx, p);
        if (input.condition === "DAMAGED")
          await this.openIncident(
            tx,
            c,
            p,
            "DAMAGED",
            input.reason ?? "Colis endommagé à la réception en agence.",
            true,
          );
        return {
          data: {
            courierId: null,
            status: input.condition === "DAMAGED" ? "FAILED" : "PENDING",
            phase: input.condition === "DAMAGED" ? "FAILED" : "AT_AGENCY",
            custodyType: "AGENCY",
            custodyAgencyId: p.agencyId,
            custodyUserId: null,
            ...(input.condition === "DAMAGED"
              ? { closedAt: new Date(), failureReason: "DAMAGED" }
              : { closedAt: null }),
          },
          orderStatus: input.condition === "DAMAGED" ? "FAILED" : undefined,
          metadata: { condition: input.condition },
        };
      },
      { safe: true },
    );
    return this.detail(c, id);
  }
  async createTransfer(
    c: Context,
    id: string,
    input: Action & { destinationAgencyId: string; transporterId: string },
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.transfer",
      input,
      "TRANSFER_CREATED",
      async (tx, p) => {
        expectPhase(p, ["AT_AGENCY", "PREPARED", "RETURN_REQUESTED"]);
        if (p.custodyType !== "AGENCY" || p.custodyAgencyId !== p.agencyId)
          throw stockError(
            "CUSTODY_CONFLICT",
            "Le colis doit être physiquement en agence.",
          );
        if (input.destinationAgencyId === p.agencyId)
          throw stockError(
            "DESTINATION_INVALID",
            "Choisissez une agence différente.",
            400,
          );
        await this.noPending(tx, p);
        await agencyWrite(tx, c, input.destinationAgencyId, true);
        const isReturn = !!p.parcelReturn;
        if (isReturn && input.destinationAgencyId !== p.parcelReturn!.agencyId)
          throw stockError(
            "RETURN_DESTINATION_INVALID",
            "Le trajet retour doit rejoindre l’agence de retour décidée.",
          );
        await collaborationAgency(
          tx,
          p.companyId,
          p.order.shopId,
          [p.agencyId, input.destinationAgencyId],
          !isReturn,
        );
        await assertDriverAssignable(
          tx,
          p.companyId,
          p.agencyId,
          input.transporterId,
        );
        const leg = await tx.parcelLeg.create({
          data: {
            companyId: p.companyId,
            deliveryId: id,
            originAgencyId: p.agencyId,
            destinationAgencyId: input.destinationAgencyId,
            transporterId: input.transporterId,
            createdById: c.actorId,
            notes: input.notes,
            isReturn,
            activeSlot: 1,
          },
        });
        return {
          data: {},
          metadata: {
            legId: leg.id,
            originAgencyId: p.agencyId,
            destinationAgencyId: input.destinationAgencyId,
            transporterId: input.transporterId,
            isReturn,
          },
        };
      },
    );
    return this.detail(c, id);
  }
  async dispatchTransfer(
    c: Context,
    id: string,
    legId: string,
    input: Action & { legVersion?: number },
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.transfer",
      { ...input, legId },
      "TRANSFER_DISPATCHED",
      async (tx, p) => {
        const leg = await tx.parcelLeg.findFirst({
          where: { id: legId, deliveryId: id, companyId: p.companyId },
        });
        if (!leg) throw stockError("LEG_NOT_FOUND", "Trajet introuvable.", 404);
        checkVersion(leg.version, input.legVersion ?? 0);
        if (
          leg.status !== "DRAFT" ||
          p.custodyType !== "AGENCY" ||
          p.custodyAgencyId !== leg.originAgencyId ||
          p.agencyId !== leg.originAgencyId
        )
          throw stockError(
            "LEG_STATE_INVALID",
            "Ce colis ne peut pas partir sur ce trajet.",
          );
        expectPhase(
          p,
          p.order.type === "FROM_STOCK" && !p.stockIssuedAt
            ? ["PREPARED"]
            : ["AT_AGENCY", "PREPARED", "RETURN_REQUESTED"],
        );
        if (
          await tx.parcelHandover.count({
            where: { deliveryId: id, status: "PENDING" },
          })
        )
          throw stockError("CUSTODY_PENDING", "Une remise est en attente.");
        await agencyWrite(tx, c, leg.destinationAgencyId, true);
        await collaborationAgency(
          tx,
          p.companyId,
          p.order.shopId,
          [leg.originAgencyId, leg.destinationAgencyId],
          !leg.isReturn,
        );
        await assertDriverAssignable(
          tx,
          p.companyId,
          p.agencyId,
          leg.transporterId,
        );
        const issued = await this.consume(tx, c, p);
        await this.assignRecord(
          tx,
          c,
          p,
          leg.transporterId,
          input.reason,
          "TRANSPORT",
        );
        await tx.parcelLeg.update({
          where: { id: leg.id },
          data: {
            status: "IN_TRANSIT",
            dispatchedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (leg.isReturn)
          await tx.deliveryReturn.update({
            where: {
              companyId_deliveryId: { companyId: p.companyId, deliveryId: id },
            },
            data: { status: "IN_TRANSIT" },
          });
        return {
          data: {
            status: "IN_PROGRESS",
            phase: "INTER_AGENCY_TRANSIT",
            courierId: leg.transporterId,
            assignedAt: new Date(),
            pickedUpAt: p.pickedUpAt ?? new Date(),
            custodyType: "TRANSPORT",
            custodyUserId: leg.transporterId,
            custodyAgencyId: leg.originAgencyId,
            closedAt: null,
            ...(issued ? { stockIssuedAt: new Date() } : {}),
          },
          orderStatus: leg.isReturn ? undefined : "IN_DELIVERY",
          metadata: {
            legId: leg.id,
            stockIssued: issued,
            originAgencyId: leg.originAgencyId,
            destinationAgencyId: leg.destinationAgencyId,
          },
        };
      },
    );
    return this.detail(c, id);
  }
  async cancelTransfer(
    c: Context,
    id: string,
    legId: string,
    input: Action & { legVersion?: number },
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.transfer",
      { ...input, legId },
      "TRANSFER_CANCELLED",
      async (tx, p) => {
        if (!input.reason)
          throw stockError(
            "REASON_REQUIRED",
            "Indiquez le motif d’abandon du trajet.",
            400,
          );
        const leg = await tx.parcelLeg.findFirst({
          where: { id: legId, companyId: p.companyId, deliveryId: id },
        });
        if (!leg) throw stockError("LEG_NOT_FOUND", "Trajet introuvable.", 404);
        checkVersion(leg.version, input.legVersion ?? 0);
        if (leg.status !== "DRAFT")
          throw stockError(
            "LEG_ALREADY_DISPATCHED",
            "Un trajet déjà parti doit être réceptionné, pas annulé.",
          );
        await tx.parcelLeg.update({
          where: { id: leg.id },
          data: {
            status: "CANCELLED",
            activeSlot: null,
            version: { increment: 1 },
          },
        });
        return { data: {}, metadata: { legId } };
      },
      { safe: true },
    );
    return this.detail(c, id);
  }
  async receiveTransfer(
    c: Context,
    id: string,
    legId: string,
    input: Action & {
      condition: string;
      legVersion?: number;
      returnToOrigin?: boolean;
    },
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.receive",
      { ...input, legId },
      "TRANSFER_RECEIVED",
      async (tx, p) => {
        const leg = await tx.parcelLeg.findFirst({
          where: { id: legId, deliveryId: id, companyId: p.companyId },
        });
        if (!leg) throw stockError("LEG_NOT_FOUND", "Trajet introuvable.", 404);
        const targetAgencyId = input.returnToOrigin
          ? leg.originAgencyId
          : leg.destinationAgencyId;
        if (input.returnToOrigin && (!input.reason || p.phase !== "FAILED"))
          throw stockError(
            "RETURN_LEG_REASON_REQUIRED",
            "Le retour à l’origine doit suivre un incident et être justifié.",
          );
        agencyAllowed(c, targetAgencyId);
        checkVersion(leg.version, input.legVersion ?? 0);
        if (
          leg.status !== "IN_TRANSIT" ||
          p.custodyType !== "TRANSPORT" ||
          p.custodyUserId !== leg.transporterId
        )
          throw stockError(
            "LEG_STATE_INVALID",
            "Ce trajet n’est pas réceptionnable.",
          );
        await agencyWrite(tx, c, targetAgencyId);
        if (input.condition === "REFUSED") {
          if (!input.reason)
            throw stockError(
              "REASON_REQUIRED",
              "Indiquez le motif de refus.",
              400,
            );
          await this.openIncident(tx, c, p, "REFUSED", input.reason, true);
          return {
            data: {
              status: "FAILED",
              phase: "FAILED",
              closedAt: new Date(),
              failureReason: "REFUSED",
            },
            orderStatus: "FAILED",
            metadata: { legId, condition: "REFUSED", receiptRefused: true },
          };
        }
        await this.closeAssignment(tx, p);
        await tx.parcelLeg.update({
          where: { id: leg.id },
          data: {
            status: "RECEIVED",
            activeSlot: null,
            receivedAt: new Date(),
            receivedById: c.actorId,
            receivedAgencyId: targetAgencyId,
            returnedToOrigin: !!input.returnToOrigin,
            condition: input.condition,
            version: { increment: 1 },
          },
        });
        const blockers = await tx.deliveryIncident.count({
          where: { deliveryId: id, status: "OPEN", blocking: true },
        });
        if (input.condition === "DAMAGED")
          await this.openIncident(
            tx,
            c,
            { ...p, agencyId: targetAgencyId },
            "DAMAGED",
            input.reason ?? "Colis endommagé à la réception inter-agences.",
            true,
          );
        const blocked = input.condition === "DAMAGED" || blockers > 0;
        return {
          data: {
            agencyId: targetAgencyId,
            courierId: null,
            status: blocked ? "FAILED" : "PENDING",
            phase: leg.isReturn
              ? "RETURN_ARRIVED"
              : blocked
                ? "FAILED"
                : "AT_AGENCY",
            custodyType: "AGENCY",
            custodyAgencyId: targetAgencyId,
            custodyUserId: null,
            closedAt: blocked ? new Date() : null,
            failureReason: blocked ? (p.failureReason ?? "DAMAGED") : null,
          },
          orderStatus: blocked ? "FAILED" : undefined,
          event: input.returnToOrigin
            ? "TRANSFER_RETURNED"
            : "TRANSFER_RECEIVED",
          metadata: {
            legId,
            condition: input.condition,
            originAgencyId: leg.originAgencyId,
            destinationAgencyId: leg.destinationAgencyId,
            receivedAgencyId: targetAgencyId,
            returnedToOrigin: !!input.returnToOrigin,
          },
        };
      },
      { agency: false, safe: true },
    );
    return this.detail(c, id);
  }
  async returnCore(
    tx: Tx,
    c: Context,
    p: Mission,
    agencyId: string,
    reason?: string,
  ): Promise<Change> {
    if (!reason)
      throw stockError("REASON_REQUIRED", "Indiquez le motif du retour.", 400);
    expectPhase(p, [
      "WITH_COURIER",
      "IN_TRANSIT",
      "FINAL_DISTRIBUTION",
      "AT_DESTINATION",
      "AWAITING_PROOF",
      "FAILED",
      "AT_AGENCY",
    ]);
    if (
      !p.pickedUpAt ||
      p.parcelReturn ||
      (p.custodyType !== "COURIER" && p.custodyType !== "AGENCY")
    )
      throw stockError(
        "RETURN_NOT_ALLOWED",
        "Ce colis ne peut pas engager un nouveau retour.",
      );
    await this.noPending(tx, p);
    await agencyWrite(tx, c, agencyId, true);
    if (p.order.type === "FROM_STOCK" && agencyId !== p.order.agencyId)
      throw stockError(
        "RETURN_AGENCY_INVALID",
        "Le retour du stock doit être contrôlé dans son agence d’origine.",
      );
    await tx.deliveryReturn.create({
      data: {
        companyId: p.companyId,
        deliveryId: p.id,
        agencyId,
        actorId: c.actorId,
        reason,
      },
    });
    return {
      data: { phase: "RETURN_REQUESTED" },
      metadata: { agencyId, reason },
    };
  }
  async requestReturn(
    c: Context,
    id: string,
    input: Action & { agencyId: string },
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.returns",
      input,
      "RETURN_REQUESTED",
      (tx, p) => this.returnCore(tx, c, p, input.agencyId, input.reason),
      { safe: true },
    );
    return this.detail(c, id);
  }
  async restock(tx: Tx, c: Context, p: Mission, agencyId: string) {
    await permission(tx, c, "deliveries.returns");
    if (p.order.type !== "FROM_STOCK" || !p.stockIssuedAt)
      throw stockError(
        "NO_STOCK_RETURN",
        "Ce colis n’a pas de sortie de stock à réintégrer.",
      );
    if (agencyId !== p.order.agencyId)
      throw stockError(
        "RETURN_AGENCY_INVALID",
        "L’agence de restitution du stock est incorrecte.",
      );
    const rows = await tx.stockReservation.findMany({
      where: {
        companyId: p.companyId,
        status: "CONSUMED",
        orderItem: { orderId: p.orderId, active: true },
      },
    });
    if (!rows.length)
      throw stockError(
        "RESERVATION_INVALID",
        "La sortie de stock d’origine est introuvable.",
      );
    for (const r of rows) {
      const target = await this.stock.ensureBalance(
        tx,
        p.companyId,
        agencyId,
        r.shopId,
        r.productId,
      );
      await this.stock.movement(
        tx,
        c,
        target.id,
        "RETURN",
        r.quantity,
        0,
        `delivery-return:${p.id}:${r.id}`,
        `Retour contrôlé ${p.parcelReference}`,
        { reservationId: r.id },
      );
    }
  }
  async receiveReturn(
    c: Context,
    id: string,
    input: Action & { condition: string; restock?: boolean },
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.returns.receive",
      input,
      "RETURN_RECEIVED",
      async (tx, p) => {
        const ret = p.parcelReturn;
        if (!ret || !["REQUESTED", "IN_TRANSIT"].includes(ret.status))
          throw stockError(
            "RETURN_NOT_PENDING",
            "Aucun retour à réceptionner.",
          );
        agencyAllowed(c, ret.agencyId);
        await agencyWrite(tx, c, ret.agencyId);
        expectPhase(p, ["RETURNING", "RETURN_ARRIVED", "RETURN_REQUESTED"]);
        if (
          (p.custodyType === "AGENCY" && p.custodyAgencyId !== ret.agencyId) ||
          (p.custodyType !== "AGENCY" && p.custodyType !== "COURIER") ||
          (p.custodyType === "COURIER" && p.phase === "RETURN_REQUESTED")
        )
          throw stockError(
            "RETURN_NOT_ARRIVED",
            "Le colis doit arriver physiquement avant réception.",
          );
        if (input.condition === "REFUSED")
          throw stockError(
            "RECEIPT_REFUSED",
            "Un retour refusé reste sous la garde actuelle ; déclarez un incident.",
          );
        await this.noPending(tx, p);
        if (input.restock) {
          if (input.condition !== "GOOD")
            throw stockError(
              "RETURN_DAMAGED",
              "Un colis endommagé reste isolé et ne rejoint pas le disponible.",
            );
          await this.restock(tx, c, p, ret.agencyId);
        }
        await this.closeAssignment(tx, p);
        await tx.deliveryReturn.update({
          where: { id: ret.id },
          data: {
            status: "RECEIVED",
            condition: input.condition,
            receivedAt: new Date(),
            receivedById: c.actorId,
            notes: input.notes,
            ...(input.restock ? { reintegratedAt: new Date() } : {}),
          },
        });
        return {
          data: {
            courierId: null,
            agencyId: ret.agencyId,
            status: "FAILED",
            phase:
              input.condition === "DAMAGED" ? "QUARANTINED" : "RETURN_RECEIVED",
            custodyType: "AGENCY",
            custodyAgencyId: ret.agencyId,
            custodyUserId: null,
            closedAt: new Date(),
            failureReason: p.failureReason ?? "RETURNED",
          },
          orderStatus: "RETURNED",
          metadata: {
            returnId: ret.id,
            condition: input.condition,
            restocked: !!input.restock,
          },
        };
      },
      { agency: false, safe: true },
    );
    return this.detail(c, id);
  }
  async reintegrate(c: Context, id: string, input: Action) {
    await this.mutate(
      c,
      id,
      "deliveries.returns",
      input,
      "RESTOCKED",
      async (tx, p) => {
        const ret = p.parcelReturn;
        if (
          !ret ||
          ret.status !== "RECEIVED" ||
          ret.condition !== "GOOD" ||
          ret.reintegratedAt ||
          ret.returnedToShopAt ||
          p.custodyType !== "AGENCY" ||
          p.custodyAgencyId !== ret.agencyId
        )
          throw stockError(
            "RETURN_NOT_RESTOCKABLE",
            "Seul un retour reçu, contrôlé intact et non réintégré peut revenir en stock.",
          );
        agencyAllowed(c, ret.agencyId);
        if (!input.reason)
          throw stockError(
            "REASON_REQUIRED",
            "Justifiez la réintégration.",
            400,
          );
        await this.restock(tx, c, p, ret.agencyId);
        await tx.deliveryReturn.update({
          where: { id: ret.id },
          data: { reintegratedAt: new Date() },
        });
        return { data: {}, metadata: { returnId: ret.id } };
      },
    );
    return this.detail(c, id);
  }
  async returnShop(c: Context, id: string, input: Action) {
    await this.mutate(
      c,
      id,
      "deliveries.returns",
      input,
      "RETURNED_TO_SHOP",
      async (tx, p) => {
        const ret = p.parcelReturn;
        if (
          !ret ||
          ret.status !== "RECEIVED" ||
          !ret.receivedAt ||
          ret.returnedToShopAt ||
          ret.reintegratedAt ||
          p.custodyType !== "AGENCY"
        )
          throw stockError(
            "RETURN_NOT_RESTITUTABLE",
            "Seul un colis retourné non réintégré peut être restitué directement.",
          );
        if (!input.reason)
          throw stockError(
            "REASON_REQUIRED",
            "Indiquez le destinataire de la remise et son motif.",
            400,
          );
        await tx.deliveryReturn.update({
          where: { id: ret.id },
          data: { status: "SHOP_RETURNED", returnedToShopAt: new Date() },
        });
        return {
          data: {
            phase: "RETURNED_TO_SHOP",
            custodyType: "SHOP",
            custodyAgencyId: null,
            custodyUserId: null,
          },
          metadata: { returnId: ret.id, shopId: p.order.shopId },
        };
      },
    );
    return this.detail(c, id);
  }
  async retryCore(tx: Tx, p: Mission): Promise<Change> {
    expectPhase(p, ["FAILED"]);
    if (p.parcelReturn)
      throw stockError(
        "RETURN_IN_PROGRESS",
        "Le retour empêche une nouvelle tentative.",
      );
    await this.noPending(tx, p);
    if (
      await tx.deliveryIncident.count({
        where: { deliveryId: p.id, status: "OPEN", blocking: true },
      })
    )
      throw stockError(
        "INCIDENT_OPEN",
        "Traitez d’abord les incidents bloquants.",
      );
    if (
      p.custodyType !== "COURIER" &&
      p.custodyType !== "AGENCY" &&
      p.custodyType !== "SHOP"
    )
      throw stockError(
        "CUSTODY_CONFLICT",
        "La garde doit être régularisée avant reprise.",
      );
    return {
      data: {
        status:
          p.custodyType === "COURIER"
            ? "IN_PROGRESS"
            : p.courierId
              ? "ASSIGNED"
              : "PENDING",
        phase:
          p.custodyType === "COURIER"
            ? "FINAL_DISTRIBUTION"
            : p.custodyType === "SHOP"
              ? "WAITING_COLLECTION"
              : "AT_AGENCY",
        closedAt: null,
        failureReason: null,
      },
      orderStatus: p.pickedUpAt
        ? "IN_DELIVERY"
        : p.courierId
          ? "CONFIRMED"
          : "PENDING",
    };
  }
  async retry(c: Context, id: string, input: Action) {
    await this.mutate(
      c,
      id,
      "deliveries.incidents",
      input,
      "RETRY",
      async (tx, p) => {
        if (!input.reason)
          throw stockError(
            "REASON_REQUIRED",
            "Justifiez la nouvelle tentative.",
            400,
          );
        return this.retryCore(tx, p);
      },
    );
    return this.detail(c, id);
  }
  async resolveIncident(
    c: Context,
    id: string,
    incidentId: string,
    input: Action & {
      incidentVersion: number;
      decision: string;
      courierId?: string;
      agencyId?: string;
    },
  ) {
    await this.mutate(
      c,
      id,
      "deliveries.incidents",
      { ...input, incidentId },
      "INCIDENT_RESOLVED",
      async (tx, p) => {
        if (!input.reason)
          throw stockError(
            "REASON_REQUIRED",
            "Expliquez la décision sur l’incident.",
            400,
          );
        const incident = await tx.deliveryIncident.findFirst({
          where: { id: incidentId, companyId: p.companyId, deliveryId: id },
        });
        if (!incident)
          throw stockError("INCIDENT_NOT_FOUND", "Incident introuvable.", 404);
        checkVersion(incident.version, input.incidentVersion);
        if (incident.status !== "OPEN")
          throw stockError("INCIDENT_CLOSED", "Cet incident est déjà traité.");
        await tx.deliveryIncident.update({
          where: { id: incident.id },
          data: {
            status: "RESOLVED",
            decision: input.decision,
            resolutionReason: input.reason,
            resolvedById: c.actorId,
            resolvedAt: new Date(),
            version: { increment: 1 },
          },
        });
        let change: Change = { data: {} };
        if (input.decision === "RETRY") change = await this.retryCore(tx, p);
        else if (input.decision === "RETURN") {
          if (!input.agencyId)
            throw stockError(
              "AGENCY_REQUIRED",
              "Choisissez l’agence de retour.",
              400,
            );
          change = await this.returnCore(
            tx,
            c,
            p,
            input.agencyId,
            input.reason,
          );
        } else if (input.decision === "REASSIGN") {
          if (
            !input.courierId ||
            !p.courierId ||
            input.courierId === p.courierId
          )
            throw stockError(
              "COURIER_REQUIRED",
              "Choisissez un autre livreur.",
              400,
            );
          await permission(tx, c, "deliveries.assign");
          await this.noPending(tx, p);
          await collaborationAgency(tx, p.companyId, p.order.shopId, [
            p.agencyId,
          ]);
          await assertDriverAssignable(
            tx,
            p.companyId,
            p.agencyId,
            input.courierId,
          );
          if (p.custodyType === "COURIER" && p.custodyUserId === p.courierId) {
            const h = await tx.parcelHandover.create({
              data: {
                companyId: p.companyId,
                deliveryId: id,
                agencyId: p.agencyId,
                fromCourierId: p.courierId,
                targetCourierId: input.courierId,
                createdById: c.actorId,
                reason: input.reason,
                activeSlot: 1,
              },
            });
            change = {
              data: {},
              event: "HANDOVER_REQUESTED",
              metadata: { handoverId: h.id },
            };
          } else if (p.custodyType === "AGENCY" || p.custodyType === "SHOP") {
            await this.assignRecord(tx, c, p, input.courierId, input.reason);
            change = {
              data: { courierId: input.courierId, assignedAt: new Date() },
              event: "REASSIGNED",
            };
          } else
            throw stockError(
              "CUSTODY_CONFLICT",
              "Réceptionnez le colis avant réaffectation.",
            );
        }
        return {
          ...change,
          metadata: {
            ...change.metadata,
            incidentId,
            decision: input.decision,
          },
        };
      },
    );
    return this.detail(c, id);
  }
  async cancel(c: Context, id: string, input: Action) {
    await this.mutate(
      c,
      id,
      "deliveries.cancel",
      input,
      "CANCELLED",
      async (tx, p) => {
        if (!input.reason)
          throw stockError(
            "REASON_REQUIRED",
            "Indiquez le motif d’annulation.",
            400,
          );
        expectPhase(p, ["WAITING_COLLECTION", "AT_AGENCY", "PREPARED"]);
        if (p.pickedUpAt || p.stockIssuedAt || p.custodyUserId)
          throw stockError(
            "PICKED_UP_CANNOT_CANCEL",
            "Une prise en charge exige un retour physique.",
          );
        await this.noPending(tx, p);
        await this.closeAssignment(tx, p);
        await this.stockRelease(tx, c, p);
        await tx.order.update({
          where: { id: p.orderId },
          data: { cancellationReason: input.reason, cancelledAt: new Date() },
        });
        return {
          data: {
            status: "CANCELLED",
            phase: "CANCELLED",
            closedAt: new Date(),
            courierId: null,
          },
          orderStatus: "CANCELLED",
        };
      },
    );
    return this.detail(c, id);
  }
  async stockRelease(tx: Tx, c: Context, p: Mission) {
    const rows = await tx.stockReservation.findMany({
      where: {
        companyId: p.companyId,
        orderItem: { orderId: p.orderId },
        status: "ACTIVE",
      },
    });
    for (const r of rows) {
      await this.stock.movement(
        tx,
        c,
        r.stockId,
        "RELEASE",
        0,
        -r.quantity,
        `delivery-cancel:${r.id}`,
        `Annulation ${p.parcelReference}`,
        { reservationId: r.id },
      );
      await tx.stockReservation.update({
        where: { id: r.id },
        data: {
          status: "RELEASED",
          releasedAt: new Date(),
          version: { increment: 1 },
        },
      });
    }
  }
  async notifications(c: Context) {
    return this.db.$transaction(async (tx) => {
      const auth = await access(tx, c);
      if (!c.companyId) return [];
      const rows = await tx.notification.findMany({
        where: {
          companyId: c.companyId,
          recipientUserId: c.actorId,
          channel: "PUSH",
          OR: [
            { sourceEvent: { startsWith: "DELIVERY_" } },
            { sourceEvent: { startsWith: "CONFIRMATION_" } },
          ],
        },
        select: { id: true, sourceEvent: true, payload: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 30,
      });
      const result = [];
      for (const row of rows) {
        const payload = row.payload as Prisma.JsonObject;
        if (typeof payload?.deliveryId !== "string") continue;
        try {
          await this.find(tx, c, payload.deliveryId, auth.kind);
          result.push({
            ...row,
            payload: {
              deliveryId: payload.deliveryId,
              publicNumber:
                typeof payload.publicNumber === "string"
                  ? payload.publicNumber
                  : undefined,
              event:
                typeof payload.event === "string"
                  ? payload.event
                  : row.sourceEvent === "CONFIRMATION_EXCEPTION"
                    ? "OTP_EXCEPTION_REQUESTED"
                    : row.sourceEvent.replace(/^DELIVERY_/, ""),
            },
          });
        } catch (error) {
          if (
            !(error instanceof AuthError) ||
            ![403, 404].includes(error.status)
          )
            throw error;
        }
      }
      return result;
    });
  }
}
