import { z } from "zod";
import { serializable } from "../../database/transaction.js";
import { authorizeTenant, tenantFilter, } from "../authorization/tenant-access.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
const request = z
    .object({
    stockId: z.uuid(),
    orderItemId: z.uuid(),
    quantity: z.number().int().positive().max(2147483647),
    idempotencyKey: z.string().min(1).max(100),
})
    .strict();
export class StockUnavailable extends Error {
    constructor() {
        super("Stock unavailable or incompatible order item");
    }
}
// Internal transaction primitive, no route or complete order workflow is exposed in Bloc 2.
export function reserveStock(db, context, input) {
    const value = request.parse(input);
    const scope = tenantFilter(context, "stocks.reserve");
    return serializable(db, async (tx) => {
        await tx.$queryRaw `SELECT id FROM Company WHERE id=${context.companyId} FOR UPDATE`;
        await authorizeTenant(authorizationStore(tx), {
            userId: context.userId,
            companyId: context.companyId,
            ...(context.agencyId ? { agencyId: context.agencyId } : {}),
            ...(context.shopId ? { shopId: context.shopId } : {}),
        }, "stocks.reserve");
        const stock = await tx.stock.findFirst({
            where: { ...scope, id: value.stockId },
        });
        if (!stock)
            throw new StockUnavailable();
        const existing = await tx.stockReservation.findUnique({
            where: {
                companyId_idempotencyKey: {
                    companyId: context.companyId,
                    idempotencyKey: value.idempotencyKey,
                },
            },
        });
        if (existing) {
            if (existing.stockId !== stock.id ||
                existing.orderItemId !== value.orderItemId ||
                existing.quantity !== value.quantity)
                throw new Error("Idempotency key already used for another operation");
            return existing;
        }
        const item = await tx.orderItem.findFirst({
            where: {
                id: value.orderItemId,
                companyId: context.companyId,
                shopId: stock.shopId,
                productId: stock.productId,
                quantity: { gte: value.quantity },
                order: {
                    agencyId: stock.agencyId,
                    type: "FROM_STOCK",
                    status: { in: ["PENDING", "CONFIRMED", "PREPARING"] },
                    archivedAt: null,
                },
            },
        });
        if (!item)
            throw new StockUnavailable();
        const affected = await tx.$executeRaw `UPDATE Stock SET reservedQuantity = reservedQuantity + ${value.quantity}, version = version + 1, updatedAt = UTC_TIMESTAMP(3) WHERE id = ${stock.id} AND companyId = ${context.companyId} AND physicalQuantity - reservedQuantity >= ${value.quantity}`;
        if (affected !== 1)
            throw new StockUnavailable();
        const reservation = await tx.stockReservation.create({
            data: {
                companyId: context.companyId,
                stockId: stock.id,
                orderItemId: item.id,
                shopId: stock.shopId,
                productId: stock.productId,
                quantity: value.quantity,
                idempotencyKey: value.idempotencyKey,
            },
        });
        const after = await tx.stock.findUniqueOrThrow({ where: { id: stock.id } });
        await tx.stockMovement.create({
            data: {
                companyId: context.companyId,
                stockId: stock.id,
                actorId: context.userId,
                type: "RESERVE",
                physicalDelta: 0,
                reservedDelta: value.quantity,
                physicalAfter: after.physicalQuantity,
                reservedAfter: after.reservedQuantity,
                reservationId: reservation.id,
                operationKey: `reserve:${value.idempotencyKey}`,
            },
        });
        await tx.auditLog.create({
            data: {
                companyId: context.companyId,
                agencyId: stock.agencyId,
                actorId: context.userId,
                action: "stock.reserved",
                entityType: "StockReservation",
                entityId: reservation.id,
                metadata: { quantity: value.quantity, stockId: stock.id },
            },
        });
        return reservation;
    });
}
