import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { serializable } from "../../database/transaction.js";
import type { z } from "zod";
import * as v from "./validation.js";
import { StockReads } from "./read.js";
import {
  authorizeStock,
  agencyWrite,
  collaborationAgency,
  checkVersion,
  scopeStock,
  stockError,
  type StockContext,
} from "./access.js";
type Tx = Prisma.TransactionClient;
const normalized = (items: Array<{ productId: string; quantity: number }>) =>
  JSON.stringify(
    items
      .map((i) => ({ productId: i.productId, quantity: i.quantity }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
  );
export class StockService extends StockReads {
  constructor(db: PrismaClient) {
    super(db);
  }
  async transaction<T>(work: (tx: Tx) => Promise<T>) {
    try {
      return await serializable(this.db, work);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw stockError(
          "REFERENCE_EXISTS",
          "Cette référence est déjà utilisée.",
        );
      throw e;
    }
  }
  async write<T>(
    c: StockContext,
    permission: string,
    work: (tx: Tx) => Promise<T>,
  ) {
    return this.transaction(async (tx) => {
      await authorizeStock(tx, c, permission, true);
      return work(tx);
    });
  }
  audit(
    tx: Tx,
    c: StockContext,
    agencyId: string,
    action: string,
    id: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    return tx.auditLog.create({
      data: {
        companyId: c.companyId,
        agencyId,
        actorId: c.actorId,
        action: "STOCK_" + action,
        entityType: "StockOperation",
        entityId: id,
        metadata,
      },
    });
  }
  async activeProducts(
    tx: Tx,
    shopId: string,
    items: Array<{ productId: string }>,
  ) {
    if (
      (await tx.product.count({
        where: {
          shopId,
          id: { in: items.map((i) => i.productId) },
          active: true,
          archivedAt: null,
        },
      })) !== items.length
    )
      throw stockError(
        "PRODUCT_INACTIVE",
        "Un produit est inactif ou n’appartient pas à cette boutique.",
        403,
      );
  }
  async balance(tx: Tx, c: StockContext, id: string) {
    const scope = await scopeStock(tx, c);
    const s = await tx.stock.findFirst({ where: { ...scope, id } });
    if (!s) throw stockError("STOCK_NOT_FOUND", "Stock introuvable.", 404);
    await tx.$queryRaw`SELECT id FROM Stock WHERE id=${id} FOR UPDATE`;
    return tx.stock.findUniqueOrThrow({ where: { id } });
  }
  async ensureBalance(
    tx: Tx,
    companyId: string,
    agencyId: string,
    shopId: string,
    productId: string,
  ) {
    return tx.stock.upsert({
      where: {
        companyId_agencyId_shopId_productId: {
          companyId,
          agencyId,
          shopId,
          productId,
        },
      },
      create: { companyId, agencyId, shopId, productId },
      update: {},
    });
  }
  async movement(
    tx: Tx,
    c: StockContext,
    stockId: string,
    type: Prisma.StockMovementUncheckedCreateInput["type"],
    dp: number,
    dr: number,
    key: string,
    notes?: string,
    links: { reservationId?: string; transferId?: string } = {},
  ) {
    await tx.$queryRaw`SELECT id FROM Stock WHERE id=${stockId} FOR UPDATE`;
    const before = await tx.stock.findUniqueOrThrow({ where: { id: stockId } });
    if (before.companyId !== c.companyId)
      throw stockError("COMPANY_DENIED", "Stock non autorisé.", 403);
    const physical = before.physicalQuantity + dp,
      reserved = before.reservedQuantity + dr;
    if (
      !Number.isSafeInteger(physical) ||
      !Number.isSafeInteger(reserved) ||
      physical < 0 ||
      reserved < 0 ||
      reserved > physical ||
      physical > 2147483647
    )
      throw stockError(
        "STOCK_INSUFFICIENT",
        "Quantité disponible insuffisante ou limite de stock dépassée.",
      );
    const after = await tx.stock.update({
      where: { id: stockId },
      data: {
        physicalQuantity: physical,
        reservedQuantity: reserved,
        version: { increment: 1 },
      },
    });
    await tx.stockMovement.create({
      data: {
        companyId: c.companyId!,
        stockId,
        actorId: c.actorId,
        type,
        physicalDelta: dp,
        reservedDelta: dr,
        physicalAfter: physical,
        reservedAfter: reserved,
        operationKey: key,
        notes,
        ...links,
      },
    });
    return after;
  }
  async setThreshold(
    c: StockContext,
    id: string,
    input: z.infer<typeof v.threshold>,
  ) {
    await this.write(c, "stocks.threshold", async (tx) => {
      const p = await this.balance(tx, c, id);
      await agencyWrite(tx, c, p.agencyId);
      checkVersion(p.version, input.version);
      await tx.stock.update({
        where: { id },
        data: {
          alertThreshold: input.alertThreshold,
          version: { increment: 1 },
        },
      });
      await this.audit(tx, c, p.agencyId, "THRESHOLD_UPDATED", id, {
        alertThreshold: input.alertThreshold,
      });
    });
    return this.stock(c, id);
  }
  async createDeposit(c: StockContext, input: z.infer<typeof v.deposit>) {
    const id = await this.write(c, "stocks.deposit", async (tx) => {
      await agencyWrite(tx, c, input.agencyId);
      await collaborationAgency(tx, c.companyId!, input.shopId, [
        input.agencyId,
      ]);
      await this.activeProducts(tx, input.shopId, input.items);
      const old = await tx.stockDeposit.findUnique({
        where: {
          companyId_reference: {
            companyId: c.companyId!,
            reference: input.reference,
          },
        },
        include: { items: true },
      });
      if (old) {
        if (
          old.agencyId !== input.agencyId ||
          old.shopId !== input.shopId ||
          normalized(old.items) !== normalized(input.items) ||
          (old.notes ?? "") !== (input.notes ?? "")
        )
          throw stockError(
            "REFERENCE_MISMATCH",
            "Cette référence correspond à un autre dépôt.",
          );
        return old.id;
      }
      const p = await tx.stockDeposit.create({
        data: {
          companyId: c.companyId!,
          agencyId: input.agencyId,
          shopId: input.shopId,
          reference: input.reference,
          actorId: c.actorId,
          notes: input.notes,
        },
      });
      await tx.stockDepositItem.createMany({
        data: input.items.map((i) => ({
          ...i,
          companyId: c.companyId!,
          depositId: p.id,
          shopId: input.shopId,
        })),
      });
      await this.audit(tx, c, input.agencyId, "DEPOSIT_CREATED", p.id, {
        reference: p.reference,
        shopId: p.shopId,
      });
      return p.id;
    });
    return this.deposit(c, id);
  }
  async depositAction(
    c: StockContext,
    id: string,
    action: "confirm" | "cancel",
    input: z.infer<typeof v.action>,
  ) {
    await this.write(c, "stocks.deposit", async (tx) => {
      const p = await tx.stockDeposit.findFirst({
        where: { id, companyId: c.companyId },
        include: { items: true },
      });
      if (!p) throw stockError("DEPOSIT_NOT_FOUND", "Dépôt introuvable.", 404);
      await agencyWrite(tx, c, p.agencyId);
      checkVersion(p.version, input.version);
      if (p.status !== "DRAFT")
        throw stockError(
          "DEPOSIT_FINAL",
          "Ce dépôt est déjà confirmé ou annulé.",
        );
      if (action === "confirm") {
        await collaborationAgency(tx, p.companyId, p.shopId, [p.agencyId]);
        await this.activeProducts(tx, p.shopId, p.items);
        for (const i of [...p.items].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        )) {
          const s = await this.ensureBalance(
            tx,
            p.companyId,
            p.agencyId,
            p.shopId,
            i.productId,
          );
          await this.movement(
            tx,
            c,
            s.id,
            "DEPOSIT",
            i.quantity,
            0,
            `deposit:${id}:${i.id}`,
            p.notes ?? undefined,
          );
        }
      }
      await tx.stockDeposit.update({
        where: { id },
        data: {
          status: action === "confirm" ? "CONFIRMED" : "CANCELLED",
          version: { increment: 1 },
          ...(action === "confirm"
            ? { confirmedById: c.actorId, confirmedAt: new Date() }
            : { cancelledAt: new Date() }),
        },
      });
      await this.audit(
        tx,
        c,
        p.agencyId,
        action === "confirm" ? "DEPOSIT_CONFIRMED" : "DEPOSIT_CANCELLED",
        id,
        { reason: input.reason ?? null },
      );
    });
    return this.deposit(c, id);
  }
  async createWithdrawal(c: StockContext, input: z.infer<typeof v.withdrawal>) {
    const id = await this.write(c, "stocks.withdraw", async (tx) => {
      const s = await this.balance(tx, c, input.stockId);
      await agencyWrite(tx, c, s.agencyId);
      await collaborationAgency(
        tx,
        s.companyId,
        s.shopId,
        [s.agencyId],
        input.kind !== "RETURN",
      );
      const old = await tx.stockWithdrawal.findUnique({
        where: {
          companyId_reference: {
            companyId: s.companyId,
            reference: input.reference,
          },
        },
      });
      if (old) {
        if (
          old.stockId !== input.stockId ||
          old.quantity !== input.quantity ||
          old.kind !== input.kind ||
          old.reason !== input.reason ||
          (old.recipient ?? "") !== (input.recipient ?? "")
        )
          throw stockError(
            "REFERENCE_MISMATCH",
            "Cette référence correspond à une autre sortie.",
          );
        return old.id;
      }
      const p = await tx.stockWithdrawal.create({
        data: {
          companyId: s.companyId,
          agencyId: s.agencyId,
          shopId: s.shopId,
          stockId: s.id,
          reference: input.reference,
          quantity: input.quantity,
          kind: input.kind,
          reason: input.reason,
          recipient: input.recipient,
          actorId: c.actorId,
        },
      });
      await this.movement(
        tx,
        c,
        s.id,
        "ISSUE",
        -input.quantity,
        0,
        `withdrawal:${p.id}`,
        `${input.kind === "RETURN" ? "Restitution à la boutique" : "Retrait autorisé"} : ${input.reason}`,
      );
      await this.audit(tx, c, s.agencyId, "WITHDRAWAL", p.id, {
        reference: input.reference,
        quantity: input.quantity,
        kind: input.kind,
        reason: input.reason,
        recipient: input.recipient ?? null,
      });
      return p.id;
    });
    return this.withdrawal(c, id);
  }
  async createReservation(
    c: StockContext,
    input: z.infer<typeof v.reservation>,
  ) {
    const id = await this.write(c, "stocks.reserve", async (tx) => {
      const s = await this.balance(tx, c, input.stockId);
      await agencyWrite(tx, c, s.agencyId);
      await collaborationAgency(tx, s.companyId, s.shopId, [s.agencyId]);
      await this.activeProducts(tx, s.shopId, [{ productId: s.productId }]);
      const old = await tx.stockReservation.findUnique({
        where: {
          companyId_reference: {
            companyId: s.companyId,
            reference: input.reference,
          },
        },
      });
      if (old) {
        if (
          old.stockId !== s.id ||
          old.quantity !== input.quantity ||
          (old.notes ?? "") !== (input.notes ?? "")
        )
          throw stockError(
            "REFERENCE_MISMATCH",
            "Cette référence correspond à une autre réservation.",
          );
        return old.id;
      }
      const p = await tx.stockReservation.create({
        data: {
          companyId: s.companyId,
          stockId: s.id,
          shopId: s.shopId,
          productId: s.productId,
          quantity: input.quantity,
          reference: input.reference,
          idempotencyKey: `manual:${input.reference}`,
          notes: input.notes,
        },
      });
      await this.movement(
        tx,
        c,
        s.id,
        "RESERVE",
        0,
        input.quantity,
        `reservation:${p.id}`,
        input.notes,
        { reservationId: p.id },
      );
      await this.audit(tx, c, s.agencyId, "RESERVED", p.id, {
        reference: input.reference,
        quantity: input.quantity,
      });
      return p.id;
    });
    return this.reservation(c, id);
  }
  async reservationAction(
    c: StockContext,
    id: string,
    action: "release" | "consume",
    input: z.infer<typeof v.action>,
  ) {
    await this.write(c, "stocks.reserve", async (tx) => {
      const p = await tx.stockReservation.findFirst({
        where: { id, companyId: c.companyId },
        include: { stock: true },
      });
      if (!p)
        throw stockError(
          "RESERVATION_NOT_FOUND",
          "Réservation introuvable.",
          404,
        );
      await agencyWrite(tx, c, p.stock.agencyId);
      if (p.orderItemId)
        throw stockError("ORDER_RESERVATION_MANAGED", "Cette réservation est gérée depuis sa commande.");
      checkVersion(p.version, input.version);
      if (p.releasedAt || p.consumedAt || p.status !== "ACTIVE")
        throw stockError(
          "RESERVATION_FINAL",
          "Cette réservation est déjà clôturée.",
        );
      if (action === "consume") {
        await authorizeStock(tx, c, "stocks.withdraw", true);
        if (!input.reason)
          throw stockError(
            "REASON_REQUIRED",
            "Indiquez la transition logistique justifiant la sortie.",
            400,
          );
        await collaborationAgency(tx, p.companyId, p.shopId, [
          p.stock.agencyId,
        ]);
      }
      await this.movement(
        tx,
        c,
        p.stockId,
        action === "release" ? "RELEASE" : "ISSUE",
        action === "consume" ? -p.quantity : 0,
        -p.quantity,
        `${action}:${id}`,
        input.reason,
        { reservationId: id },
      );
      await tx.stockReservation.update({
        where: { id },
        data: {
          status: action === "release" ? "RELEASED" : "CONSUMED",
          version: { increment: 1 },
          ...(action === "release"
            ? { releasedAt: new Date() }
            : { consumedAt: new Date() }),
        },
      });
      await this.audit(
        tx,
        c,
        p.stock.agencyId,
        action === "release" ? "RESERVATION_RELEASED" : "RESERVATION_CONSUMED",
        id,
        { quantity: p.quantity, reason: input.reason ?? null },
      );
    });
    return this.reservation(c, id);
  }
  async createTransfer(c: StockContext, input: z.infer<typeof v.transfer>) {
    const id = await this.write(c, "stocks.transfer", async (tx) => {
      await agencyWrite(tx, c, input.originAgencyId);
      await agencyWrite(tx, c, input.destinationAgencyId, true);
      await collaborationAgency(tx, c.companyId!, input.shopId, [
        input.originAgencyId,
        input.destinationAgencyId,
      ]);
      await this.activeProducts(tx, input.shopId, input.items);
      const old = await tx.transfer.findUnique({
        where: {
          companyId_reference: {
            companyId: c.companyId!,
            reference: input.reference,
          },
        },
        include: { transferItem_transferRecords: true },
      });
      if (old) {
        if (
          old.originAgencyId !== input.originAgencyId ||
          old.destinationAgencyId !== input.destinationAgencyId ||
          old.transferItem_transferRecords.some(
            (i) => i.shopId !== input.shopId,
          ) ||
          normalized(old.transferItem_transferRecords) !==
            normalized(input.items)
        )
          throw stockError(
            "REFERENCE_MISMATCH",
            "Cette référence correspond à un autre transfert.",
          );
        return old.id;
      }
      const p = await tx.transfer.create({
        data: {
          companyId: c.companyId!,
          reference: input.reference,
          originAgencyId: input.originAgencyId,
          destinationAgencyId: input.destinationAgencyId,
          initiatedById: c.actorId,
          notes: input.notes,
        },
      });
      await tx.transferItem.createMany({
        data: input.items.map((i) => ({
          ...i,
          companyId: c.companyId!,
          transferId: p.id,
          shopId: input.shopId,
        })),
      });
      await tx.transferEvent.create({
        data: {
          companyId: p.companyId,
          transferId: p.id,
          actorId: c.actorId,
          status: "DRAFT",
          notes: input.notes,
        },
      });
      await this.audit(tx, c, p.originAgencyId, "TRANSFER_CREATED", p.id, {
        destinationAgencyId: p.destinationAgencyId,
        reference: p.reference,
      });
      return p.id;
    });
    return this.transfer(c, id);
  }
  async transferRecord(tx: Tx, c: StockContext, id: string) {
    const p = await tx.transfer.findFirst({
      where: { id, companyId: c.companyId },
      include: { transferItem_transferRecords: true },
    });
    if (!p)
      throw stockError("TRANSFER_NOT_FOUND", "Transfert introuvable.", 404);
    return p;
  }
  async transferAction(
    c: StockContext,
    id: string,
    action: "dispatch" | "cancel",
    input: z.infer<typeof v.action>,
  ) {
    await this.write(c, "stocks.transfer", async (tx) => {
      const p = await this.transferRecord(tx, c, id);
      await agencyWrite(tx, c, p.originAgencyId);
      checkVersion(p.version, input.version);
      if (p.status !== "DRAFT")
        throw stockError(
          "TRANSFER_FINAL",
          "Ce transfert a déjà quitté le brouillon.",
        );
      if (action === "dispatch")
        for (const i of [...p.transferItem_transferRecords].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        )) {
          await collaborationAgency(tx, p.companyId, i.shopId, [
            p.originAgencyId,
            p.destinationAgencyId,
          ]);
          await this.activeProducts(tx, i.shopId, [i]);
          await agencyWrite(tx, c, p.destinationAgencyId, true);
          const s = await tx.stock.findUnique({
            where: {
              companyId_agencyId_shopId_productId: {
                companyId: p.companyId,
                agencyId: p.originAgencyId,
                shopId: i.shopId,
                productId: i.productId,
              },
            },
          });
          if (!s)
            throw stockError(
              "STOCK_INSUFFICIENT",
              "Aucun stock disponible pour un article.",
            );
          await this.movement(
            tx,
            c,
            s.id,
            "TRANSFER_OUT",
            -i.quantity,
            0,
            `dispatch:${id}:${i.id}`,
            p.notes ?? undefined,
            { transferId: id },
          );
        }
      const status = action === "dispatch" ? "IN_TRANSIT" : "CANCELLED";
      await tx.transfer.update({
        where: { id },
        data: {
          status,
          version: { increment: 1 },
          ...(action === "dispatch" ? { departedAt: new Date() } : {}),
        },
      });
      await tx.transferEvent.create({
        data: {
          companyId: p.companyId,
          transferId: id,
          actorId: c.actorId,
          status,
          notes: input.reason,
        },
      });
      await this.audit(
        tx,
        c,
        p.originAgencyId,
        action === "dispatch" ? "TRANSFER_DISPATCHED" : "TRANSFER_CANCELLED",
        id,
        { reason: input.reason ?? null },
      );
    });
    return this.transfer(c, id);
  }
  async finishTransfer(
    tx: Tx,
    c: StockContext,
    id: string,
    agencyId: string,
    notes?: string,
  ) {
    const items = await tx.transferItem.findMany({
      where: { companyId: c.companyId, transferId: id },
    });
    const open = await tx.transferIncident.count({
      where: { companyId: c.companyId, transferId: id, status: "OPEN" },
    });
    const done =
      !open &&
      items.every(
        (i) =>
          i.quantity ===
          i.receivedQuantity + i.lostQuantity + i.returnedQuantity,
      );
    const status = done ? "RECEIVED" : "IN_TRANSIT";
    await tx.transfer.update({
      where: { id },
      data: {
        version: { increment: 1 },
        status,
        ...(done ? { receivedAt: new Date() } : {}),
      },
    });
    await tx.transferEvent.create({
      data: {
        companyId: c.companyId!,
        transferId: id,
        actorId: c.actorId,
        status,
        notes,
      },
    });
    await this.audit(tx, c, agencyId, "TRANSFER_UPDATED", id, {
      status,
      notes: notes ?? null,
    });
  }
  async receiveTransfer(
    c: StockContext,
    id: string,
    input: z.infer<typeof v.receipt>,
  ) {
    await this.write(c, "stocks.transfer", async (tx) => {
      const p = await this.transferRecord(tx, c, id);
      await agencyWrite(tx, c, p.destinationAgencyId);
      checkVersion(p.version, input.version);
      if (p.status !== "IN_TRANSIT")
        throw stockError(
          "TRANSFER_NOT_IN_TRANSIT",
          "Ce transfert n’est pas en transit.",
        );
      for (const line of [...input.items].sort((a, b) =>
        a.itemId.localeCompare(b.itemId),
      )) {
        const i = p.transferItem_transferRecords.find(
          (i) => i.id === line.itemId,
        );
        const open = await tx.transferIncident.aggregate({
          where: {
            companyId: p.companyId,
            transferId: id,
            itemId: line.itemId,
            status: "OPEN",
          },
          _sum: { quantity: true },
        });
        if (
          !i ||
          line.quantity >
            i.quantity -
              i.receivedQuantity -
              i.lostQuantity -
              i.returnedQuantity -
              (open._sum.quantity ?? 0)
        )
          throw stockError(
            "RECEIPT_EXCEEDS_TRANSIT",
            "Quantité reçue supérieure au transit restant.",
          );
        await collaborationAgency(
          tx,
          p.companyId,
          i.shopId,
          [p.destinationAgencyId],
          false,
        );
        const s = await this.ensureBalance(
          tx,
          p.companyId,
          p.destinationAgencyId,
          i.shopId,
          i.productId,
        );
        await this.movement(
          tx,
          c,
          s.id,
          "TRANSFER_IN",
          line.quantity,
          0,
          `receive:${id}:${p.version}:${i.id}`,
          input.notes,
          { transferId: id },
        );
        await tx.transferItem.update({
          where: { id: i.id },
          data: { receivedQuantity: { increment: line.quantity } },
        });
      }
      await this.finishTransfer(tx, c, id, p.destinationAgencyId, input.notes);
    });
    return this.transfer(c, id);
  }
  async declareIncident(
    c: StockContext,
    id: string,
    input: z.infer<typeof v.incident>,
  ) {
    await this.write(c, "stocks.transfer", async (tx) => {
      const p = await this.transferRecord(tx, c, id);
      if (
        c.scope === "AGENCY" &&
        ![p.originAgencyId, p.destinationAgencyId].includes(c.agencyId!)
      )
        throw stockError("AGENCY_DENIED", "Agence non autorisée.", 403);
      checkVersion(p.version, input.version);
      if (p.status !== "IN_TRANSIT")
        throw stockError(
          "TRANSFER_NOT_IN_TRANSIT",
          "Déclarez l’incident sur un transfert en transit.",
        );
      const i = p.transferItem_transferRecords.find(
        (i) => i.id === input.itemId,
      );
      const open = await tx.transferIncident.aggregate({
        where: {
          companyId: p.companyId,
          transferId: id,
          itemId: input.itemId,
          status: "OPEN",
        },
        _sum: { quantity: true },
      });
      if (
        !i ||
        input.quantity >
          i.quantity -
            i.receivedQuantity -
            i.lostQuantity -
            i.returnedQuantity -
            (open._sum.quantity ?? 0)
      )
        throw stockError(
          "INCIDENT_EXCEEDS_TRANSIT",
          "La quantité dépasse le transit non résolu.",
        );
      await tx.transferIncident.create({
        data: {
          companyId: p.companyId,
          transferId: id,
          itemId: i.id,
          shopId: i.shopId,
          productId: i.productId,
          quantity: input.quantity,
          kind: input.kind,
          description: input.description,
          actorId: c.actorId,
        },
      });
      await tx.transfer.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await this.audit(
        tx,
        c,
        c.agencyId ?? p.originAgencyId,
        "TRANSFER_INCIDENT",
        id,
        { itemId: i.id, quantity: input.quantity, kind: input.kind },
      );
    });
    return this.transfer(c, id);
  }
  async resolveIncident(
    c: StockContext,
    id: string,
    incidentId: string,
    input: z.infer<typeof v.resolution>,
  ) {
    await this.write(c, "stocks.approve", async (tx) => {
      const p = await this.transferRecord(tx, c, id);
      if (
        c.scope === "AGENCY" &&
        ![p.originAgencyId, p.destinationAgencyId].includes(c.agencyId!)
      )
        throw stockError("AGENCY_DENIED", "Agence non autorisée.", 403);
      checkVersion(p.version, input.version);
      const incident = await tx.transferIncident.findFirst({
        where: {
          id: incidentId,
          companyId: p.companyId,
          transferId: id,
          status: "OPEN",
        },
      });
      if (!incident)
        throw stockError(
          "INCIDENT_FINAL",
          "Incident introuvable ou déjà résolu.",
        );
      const i = p.transferItem_transferRecords.find(
        (i) => i.id === incident.itemId,
      );
      if (
        !i ||
        incident.quantity >
          i.quantity - i.receivedQuantity - i.lostQuantity - i.returnedQuantity
      )
        throw stockError(
          "INCIDENT_EXCEEDS_TRANSIT",
          "Ce transit a changé. Vérifiez l’incident.",
        );
      if (input.action !== "CONFIRM_LOSS") {
        const agencyId =
          input.action === "RETURN_TO_ORIGIN"
            ? p.originAgencyId
            : p.destinationAgencyId;
        await agencyWrite(tx, c, agencyId);
        await collaborationAgency(tx, p.companyId, i.shopId, [agencyId], false);
        const s = await this.ensureBalance(
          tx,
          p.companyId,
          agencyId,
          i.shopId,
          i.productId,
        );
        await this.movement(
          tx,
          c,
          s.id,
          input.action === "RETURN_TO_ORIGIN" ? "RETURN" : "TRANSFER_IN",
          incident.quantity,
          0,
          `incident:${incidentId}`,
          input.reason,
          { transferId: id },
        );
      }
      await tx.transferItem.update({
        where: { id: i.id },
        data:
          input.action === "CONFIRM_LOSS"
            ? { lostQuantity: { increment: incident.quantity } }
            : input.action === "RETURN_TO_ORIGIN"
              ? { returnedQuantity: { increment: incident.quantity } }
              : { receivedQuantity: { increment: incident.quantity } },
      });
      await tx.transferIncident.update({
        where: { id: incidentId },
        data: {
          status: "RESOLVED",
          resolvedById: c.actorId,
          resolvedAt: new Date(),
          resolution: input.action,
          reason: input.reason,
        },
      });
      await this.finishTransfer(
        tx,
        c,
        id,
        c.agencyId ?? p.originAgencyId,
        `${{ RECOVER_TO_DESTINATION: "Récupération à destination", RETURN_TO_ORIGIN: "Retour à l’origine", CONFIRM_LOSS: "Perte de transit validée" }[input.action]} : ${input.reason}`,
      );
    });
    return this.transfer(c, id);
  }
  async createInventory(c: StockContext, input: z.infer<typeof v.inventory>) {
    const id = await this.write(c, "stocks.inventory", async (tx) => {
      await agencyWrite(tx, c, input.agencyId);
      const old = await tx.inventorySession.findUnique({
        where: {
          companyId_reference: {
            companyId: c.companyId!,
            reference: input.reference,
          },
        },
      });
      if (old) {
        if (
          old.agencyId !== input.agencyId ||
          old.shopId !== (input.shopId ?? null)
        )
          throw stockError(
            "REFERENCE_MISMATCH",
            "Référence d’inventaire utilisée.",
          );
        return old.id;
      }
      const stocks = await tx.stock.findMany({
        where: {
          companyId: c.companyId,
          agencyId: input.agencyId,
          ...(input.shopId ? { shopId: input.shopId } : {}),
        },
        orderBy: { id: "asc" },
        take: 501,
      });
      if (!stocks.length)
        throw stockError("INVENTORY_EMPTY", "Aucun stock à inventorier.");
      if (stocks.length > 500)
        throw stockError(
          "INVENTORY_TOO_LARGE",
          "Précisez une boutique pour limiter l’inventaire à 500 lignes.",
        );
      for (const s of stocks)
        await collaborationAgency(tx, s.companyId, s.shopId, [s.agencyId]);
      const p = await tx.inventorySession.create({
        data: {
          companyId: c.companyId!,
          agencyId: input.agencyId,
          shopId: input.shopId,
          reference: input.reference,
          actorId: c.actorId,
          notes: input.notes,
        },
      });
      await tx.inventoryItem.createMany({
        data: stocks.map((s) => ({
          companyId: s.companyId,
          inventoryId: p.id,
          stockId: s.id,
          shopId: s.shopId,
          productId: s.productId,
          expectedPhysical: s.physicalQuantity,
          expectedReserved: s.reservedQuantity,
          stockVersion: s.version,
        })),
      });
      await this.audit(tx, c, p.agencyId, "INVENTORY_CREATED", p.id, {
        reference: p.reference,
      });
      return p.id;
    });
    return this.inventory(c, id);
  }
  async inventoryRecord(tx: Tx, c: StockContext, id: string) {
    const p = await tx.inventorySession.findFirst({
      where: { id, companyId: c.companyId },
      include: { items: true },
    });
    if (!p)
      throw stockError("INVENTORY_NOT_FOUND", "Inventaire introuvable.", 404);
    await agencyWrite(tx, c, p.agencyId);
    return p;
  }
  async countInventory(
    c: StockContext,
    id: string,
    input: z.infer<typeof v.count>,
  ) {
    await this.write(c, "stocks.inventory", async (tx) => {
      const p = await this.inventoryRecord(tx, c, id);
      checkVersion(p.version, input.version);
      if (p.status !== "DRAFT")
        throw stockError(
          "INVENTORY_FINAL",
          "Cet inventaire n’est plus modifiable.",
        );
      for (const line of input.items) {
        const item = p.items.find((i) => i.id === line.itemId);
        if (!item)
          throw stockError(
            "INVENTORY_LINE_INVALID",
            "Ligne d’inventaire non autorisée.",
            403,
          );
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { countedQuantity: line.countedQuantity, reason: line.reason },
        });
      }
      await tx.inventorySession.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await this.audit(tx, c, p.agencyId, "INVENTORY_COUNTED", id, {
        lines: input.items.length,
      });
    });
    return this.inventory(c, id);
  }
  async inventoryAction(
    c: StockContext,
    id: string,
    action: "submit" | "approve" | "reject",
    input: z.infer<typeof v.action>,
  ) {
    await this.write(
      c,
      action === "submit" ? "stocks.inventory" : "stocks.approve",
      async (tx) => {
        const p = await this.inventoryRecord(tx, c, id);
        checkVersion(p.version, input.version);
        if (action === "submit") {
          if (
            p.status !== "DRAFT" ||
            p.items.some((i) => i.countedQuantity === null)
          )
            throw stockError(
              "INVENTORY_INCOMPLETE",
              "Comptez toutes les lignes avant soumission.",
            );
          if (
            p.items.some(
              (i) => i.countedQuantity !== i.expectedPhysical && !i.reason,
            )
          )
            throw stockError(
              "REASON_REQUIRED",
              "Justifiez chaque écart avant soumission.",
              400,
            );
          await tx.inventorySession.update({
            where: { id },
            data: {
              status: "SUBMITTED",
              version: { increment: 1 },
              submittedById: c.actorId,
              submittedAt: new Date(),
            },
          });
        } else {
          if (p.status !== "SUBMITTED")
            throw stockError(
              "INVENTORY_NOT_SUBMITTED",
              "Cet inventaire n’attend pas de décision.",
            );
          if (!input.reason)
            throw stockError(
              "REASON_REQUIRED",
              "Indiquez le motif de la décision.",
              400,
            );
          if (action === "approve")
            for (const i of [...p.items].sort((a, b) =>
              a.stockId.localeCompare(b.stockId),
            )) {
              await collaborationAgency(tx, p.companyId, i.shopId, [
                p.agencyId,
              ]);
              const s = await this.balance(tx, c, i.stockId);
              if (
                s.version !== i.stockVersion ||
                s.physicalQuantity !== i.expectedPhysical ||
                s.reservedQuantity !== i.expectedReserved
              )
                throw stockError(
                  "INVENTORY_STALE",
                  "Le stock a changé depuis le relevé. Rejetez et recommencez cet inventaire.",
                );
              const delta = i.countedQuantity! - s.physicalQuantity;
              if (delta)
                await this.movement(
                  tx,
                  c,
                  s.id,
                  "ADJUSTMENT",
                  delta,
                  0,
                  `inventory:${id}:${i.id}`,
                  i.reason ?? input.reason,
                );
            }
          await tx.inventorySession.update({
            where: { id },
            data: {
              status: action === "approve" ? "APPROVED" : "REJECTED",
              version: { increment: 1 },
              decidedById: c.actorId,
              decidedAt: new Date(),
              reason: input.reason,
            },
          });
        }
        await this.audit(
          tx,
          c,
          p.agencyId,
          "INVENTORY_" + action.toUpperCase(),
          id,
          { reason: input.reason ?? null },
        );
      },
    );
    return this.inventory(c, id);
  }
}
