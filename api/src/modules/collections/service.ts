import { FinancialCore, type Tx } from "./core.js";
import { access, agencyAllowed, type Context } from "./access.js";
import { checkVersion, stockError } from "../stocks/access.js";
import { ledger, collectionInclude } from "./ledger.js";
import { amount, units, bounded, sum } from "./money.js";
import type { z } from "zod";
import * as v from "./validation.js";
export class FinancialService extends FinancialCore {
  async requestCorrection(c: Context, input: z.infer<typeof v.correction>) {
    const auth = await this.db.$transaction((tx) => access(tx, c)),
      required =
        input.kind === "EXPECTED" || input.kind === "EXCEPTION"
          ? "collections.expected.request"
          : auth.kind === "driver"
            ? "financial.corrections.self.request"
            : "financial.corrections.request";
    const id = await this.write(
      c,
      required,
      input,
      "CORRECTION_REQUESTED",
      async (tx) => {
        const source = await this.correctionSource(tx, c, input),
          p = source.delivery,
          a = source.account;
        let targetAmount = input.amount;
        let from = source.current,
          exceptional = false;
        if (input.kind === "EXPECTED" || input.kind === "EXCEPTION") {
          agencyAllowed(c, p.order.agencyId);
          if (input.collectionId || input.remittanceItemId)
            throw stockError(
              "CORRECTION_TARGET_INVALID",
              "La correction attendue porte uniquement sur la mission.",
              400,
            );
          if (input.kind === "EXPECTED") {
            await this.validNewOperation(tx, c);
            exceptional = !!p.pickedUpAt;
            if (
              exceptional &&
              !auth.permissions.includes("collections.expected.exception")
            )
              throw stockError(
                "EXCEPTION_AUTHORITY_REQUIRED",
                "Apr�s enl�vement, un administrateur doit demander explicitement la correction exceptionnelle.",
                403,
              );
          } else if (!p.pickedUpAt)
            throw stockError(
              "MISSION_NOT_ENGAGED",
              "Une exception documente une mission d�j� engag�e.",
            );
          if (
            await tx.financialCorrection.count({
              where: {
                companyId: c.companyId,
                deliveryId: p.id,
                kind: { in: ["EXPECTED", "EXCEPTION"] },
                status: "PENDING",
              },
            })
          )
            throw stockError(
              "CORRECTION_PENDING",
              "Une demande est d�j� en attente pour cette obligation.",
            );
          if (input.kind === "EXCEPTION") {
            const accounts = await ledger(
              tx,
              await tx.collection.findMany({
                where: { companyId: p.companyId, deliveryId: p.id },
                include: collectionInclude,
              }),
            );
            if (accounts.some((a) => a.legacy))
              throw stockError(
                "LEGACY_REVIEW_REQUIRED",
                "L'historique doit �tre rapproch� avant une d�rogation.",
              );
            const net = sum(accounts.map((a) => units(a.net)));
            if (!p.order.collectionRequired || net >= from)
              throw stockError(
                "NO_PARTIAL_EXCEPTION_NEEDED",
                "Aucun montant restant ne n�cessite cette d�rogation.",
              );
            targetAmount = amount(net);
          }
        } else {
          if (!a || a.legacy || a.blocked)
            throw stockError(
              "CORRECTION_PENDING",
              "Cet encaissement poss�de une demande en attente ou un historique � rapprocher.",
            );
          if (input.kind === "REFUND" || input.kind === "AGENCY_REFUND") {
            from = 0n;
            if (
              units(input.amount) <= 0n ||
              units(input.amount) >
                units(
                  input.kind === "AGENCY_REFUND"
                    ? a.agencyRetained
                    : a.available,
                )
            )
              throw stockError(
                "REFUND_EXCEEDS_FUNDS",
                "Le remboursement externe d�clar� ne peut d�passer les fonds encore d�tenus et non engag�s.",
              );
            if (!input.externalReference?.trim())
              throw stockError(
                "REFUND_REFERENCE_REQUIRED",
                "Indiquez la r�f�rence ou le constat de la restitution physique.",
                400,
              );
          }
          if (
            input.kind === "COLLECTION" &&
            units(input.amount) <
              units(a.courierRefunded) + units(a.confirmed) + units(a.reserved)
          )
            throw stockError(
              "CORRECTION_BELOW_ACCOUNTED",
              "La correction ne peut effacer des fonds d�j� re�us, rembours�s ou engag�s dans une remise.",
            );
          if (input.kind === "RECEIPT") {
            if (units(input.amount) > units(a.available) + source.current)
              throw stockError(
                "BALANCE_EXCEEDED",
                "La r�ception corrig�e d�passerait les fonds tra�ables.",
              );
            if (
              units(a.confirmed) - source.current + units(input.amount) <
              units(a.agencyRefunded)
            )
              throw stockError(
                "RECEIPT_BELOW_REFUNDED",
                "La correction ne peut effacer des fonds d�j� rembours�s par l'agence.",
              );
          }
        }
        const row = await tx.financialCorrection.create({
          data: {
            companyId: c.companyId!,
            agencyId: source.agencyId,
            courierId: source.courierId,
            deliveryId: p.id,
            collectionId: source.collectionId,
            remittanceItemId: source.itemId,
            kind: input.kind,
            fromAmount: amount(from),
            toAmount: targetAmount,
            currency: source.currency,
            reason: input.reason,
            externalReference: input.externalReference,
            requestedById: c.actorId,
            exceptional,
          },
        });
        return {
          id: row.id,
          event: {
            agencyId: row.agencyId,
            courierId: row.courierId,
            orderId: p.orderId,
            collectionId: row.collectionId,
            correctionId: row.id,
            remittanceId: source.remittanceId,
            action: "CORRECTION_REQUESTED",
            entityId: row.id,
            status: row.status,
            amount: row.toAmount,
            currency: row.currency,
            reason: row.reason,
            metadata: {
              kind: row.kind,
              fromAmount: row.fromAmount.toFixed(4),
              exceptional,
            },
          },
        };
      },
    );
    return this.correctionResult(c, id);
  }
  async correctionSource(
    tx: Tx,
    c: Context,
    input: {
      kind: string;
      deliveryId?: string;
      collectionId?: string;
      remittanceItemId?: string;
    },
  ) {
    const auth = await access(tx, c);
    let deliveryId = input.deliveryId,
      account,
      agencyId: string,
      courierId: string | undefined,
      currency: string,
      collectionId: string | undefined,
      itemId: string | undefined,
      remittanceId: string | undefined,
      current: bigint;
    if (
      input.kind === "COLLECTION" ||
      input.kind === "REFUND" ||
      input.kind === "AGENCY_REFUND" ||
      input.kind === "RECEIPT"
    ) {
      if (input.kind === "AGENCY_REFUND" && auth.kind !== "operator")
        throw stockError(
          "AGENCY_REFUND_DENIED",
          "Seul un responsable autoris� peut d�clarer un remboursement effectu� par l'agence.",
          403,
        );
      if (input.kind === "RECEIPT") {
        if (
          !input.remittanceItemId ||
          input.collectionId ||
          input.deliveryId ||
          auth.kind !== "operator"
        )
          throw stockError(
            "CORRECTION_TARGET_INVALID",
            "Choisissez une ligne de r�ception confirm�e.",
            400,
          );
        const item = await tx.remittanceItem.findFirst({
          where: { id: input.remittanceItemId, companyId: c.companyId },
          include: { remittance: true },
        });
        if (!item)
          throw stockError(
            "REMITTANCE_NOT_FOUND",
            "Ligne de remise introuvable.",
            404,
          );
        await this.findRemittance(tx, c, item.remittanceId, auth.kind);
        if (
          !item.remittance.confirmedAt ||
          !["CONFIRM", "DISPUTE"].includes(item.remittance.decision ?? "")
        )
          throw stockError(
            "RECEIPT_NOT_CONFIRMED",
            "Cette ligne ne poss�de pas de r�ception financi�re confirm�e.",
          );
        collectionId = item.collectionId;
        itemId = item.id;
        remittanceId = item.remittanceId;
      } else {
        if (!input.collectionId || input.remittanceItemId || input.deliveryId)
          throw stockError(
            "CORRECTION_TARGET_INVALID",
            "Choisissez l'encaissement d'origine.",
            400,
          );
        collectionId = input.collectionId;
      }
      const collection = await this.findCollection(
        tx,
        c,
        collectionId,
        auth.kind,
      );
      account = (await ledger(tx, [collection]))[0]!;
      deliveryId = collection.deliveryId;
      agencyId = collection.agencyId;
      courierId = collection.courierId;
      currency = collection.currency;
      current =
        input.kind === "RECEIPT"
          ? units(account.items.find((i) => i.id === itemId)!.confirmed)
          : units(account.gross);
    } else {
      if (!deliveryId || auth.kind !== "operator")
        throw stockError(
          "CORRECTION_TARGET_INVALID",
          "Choisissez une mission de votre p�rim�tre.",
          403,
        );
      const d = await tx.delivery.findFirst({
        where: { id: deliveryId, companyId: c.companyId },
        include: { order: true },
      });
      if (!d)
        throw stockError("MISSION_NOT_FOUND", "Mission introuvable.", 404);
      agencyAllowed(c, d.order.agencyId);
      agencyId = d.order.agencyId;
      courierId = d.courierId ?? undefined;
      currency = d.order.currency;
      current = units(d.order.amountToCollect);
    }
    const delivery = await tx.delivery.findFirst({
      where: { id: deliveryId, companyId: c.companyId },
      include: { order: true },
    });
    if (!delivery)
      throw stockError("MISSION_NOT_FOUND", "Mission introuvable.", 404);
    agencyAllowed(c, agencyId);
    return {
      delivery,
      account,
      agencyId,
      courierId,
      currency,
      collectionId,
      itemId,
      remittanceId,
      current,
    };
  }
  async correctionResult(c: Context, id: string) {
    const rows = await this.corrections(c, { page: 1, size: 50 });
    const item = rows.items.find((x) => x.id === id);
    if (item) return item;
    return this.db.$transaction(async (tx) => {
      const auth = await access(tx, c);
      const row = await tx.financialCorrection.findFirst({
        where: {
          id,
          companyId: c.companyId,
          ...(c.scope === "AGENCY" ? { agencyId: c.agencyId } : {}),
          ...(auth.kind === "driver" ? { courierId: c.actorId } : {}),
        },
      });
      if (!row)
        throw stockError("CORRECTION_NOT_FOUND", "Demande introuvable.", 404);
      return {
        ...row,
        fromAmount: row.fromAmount.toFixed(4),
        toAmount: row.toAmount.toFixed(4),
        canDecide:
          auth.permissions.includes("financial.corrections.approve") &&
          row.requestedById !== c.actorId &&
          row.courierId !== c.actorId &&
          row.status === "PENDING",
      };
    });
  }
  async decideCorrection(
    c: Context,
    id: string,
    input: z.infer<typeof v.correctionDecision>,
  ) {
    await this.write(
      c,
      "financial.corrections.approve",
      { ...input, id },
      input.approve ? "CORRECTION_APPROVED" : "CORRECTION_REJECTED",
      async (tx) => {
        const row = await tx.financialCorrection.findFirst({
          where: { id, companyId: c.companyId },
        });
        if (!row)
          throw stockError("CORRECTION_NOT_FOUND", "Demande introuvable.", 404);
        agencyAllowed(c, row.agencyId);
        checkVersion(row.version, input.version);
        if (row.requestedById === c.actorId || row.courierId === c.actorId)
          throw stockError(
            "SELF_APPROVAL_DENIED",
            "La validation exige une autre personne autoris�e, distincte du livreur concern�.",
            403,
          );
        if (row.status !== "PENDING")
          throw stockError(
            "CORRECTION_ALREADY_DECIDED",
            "Cette demande a d�j� �t� trait�e.",
          );
        const d = await tx.delivery.findUniqueOrThrow({
          where: { id: row.deliveryId },
          include: { order: true },
        });
        let remittanceId: string | undefined;
        if (input.approve) {
          if (row.kind === "EXCEPTION") {
            checkVersionAmount(
              units(d.order.amountToCollect),
              units(row.fromAmount),
            );
            const accounts = await ledger(
              tx,
              await tx.collection.findMany({
                where: { companyId: d.companyId, deliveryId: d.id },
                include: collectionInclude,
              }),
            );
            checkVersionAmount(
              sum(accounts.map((a) => units(a.net))),
              units(row.toAmount),
            );
          }
          if (row.kind === "EXPECTED") {
            await this.validNewOperation(tx, c);
            checkVersionAmount(
              units(d.order.amountToCollect),
              units(row.fromAmount),
            );
            if (d.pickedUpAt && !row.exceptional)
              throw stockError(
                "EXCEPTION_REQUIRED",
                "La prise en charge est intervenue depuis la demande ; une demande exceptionnelle est n�cessaire.",
              );
            const newAmount = bounded(units(row.toAmount));
            await tx.order.update({
              where: { id: d.orderId },
              data: {
                amountToCollect: newAmount,
                collectionRequired: units(newAmount) > 0n,
                version: { increment: 1 },
              },
            });
            const next = await tx.delivery.update({
              where: { id: d.id },
              data: { version: { increment: 1 } },
            });
            await tx.deliveryEvent.create({
              data: {
                companyId: d.companyId,
                deliveryId: d.id,
                actorId: c.actorId,
                status: d.status,
                previousStatus: d.status,
                sequence: next.version,
                action: "FINANCIAL_EXPECTED_CHANGED",
                fromPhase: d.phase,
                toPhase: d.phase,
                agencyId: d.agencyId,
                reason: row.reason,
                metadata: {
                  correctionId: row.id,
                  fromAmount: row.fromAmount.toFixed(4),
                  toAmount: newAmount,
                  currency: row.currency,
                  exceptional: row.exceptional,
                },
              },
            });
            await tx.orderEvent.create({
              data: {
                companyId: d.companyId,
                orderId: d.orderId,
                actorId: c.actorId,
                status: d.order.status,
                previousStatus: d.order.status,
                action: "FINANCIAL_EXPECTED_CHANGED",
                notes: row.reason,
                metadata: {
                  correctionId: row.id,
                  fromAmount: row.fromAmount.toFixed(4),
                  toAmount: newAmount,
                  currency: row.currency,
                },
              },
            });
          } else if (row.kind !== "EXCEPTION") {
            const collectionId = row.collectionId!;
            const source = await tx.collection.findFirstOrThrow({
                where: { id: collectionId, companyId: c.companyId },
                include: collectionInclude,
              }),
              a = (await ledger(tx, [source]))[0]!;
            if (a.legacy)
              throw stockError(
                "LEGACY_REVIEW_REQUIRED",
                "L'historique ancien doit �tre rapproch�.",
              );
            if (row.kind === "COLLECTION") {
              checkVersionAmount(units(a.gross), units(row.fromAmount));
              if (
                units(row.toAmount) <
                units(a.courierRefunded) +
                  units(a.confirmed) +
                  units(a.reserved)
              )
                throw stockError(
                  "CORRECTION_BELOW_ACCOUNTED",
                  "Cette correction effacerait des fonds d�j� justifi�s ou engag�s.",
                );
            } else if (row.kind === "REFUND" || row.kind === "AGENCY_REFUND") {
              if (
                units(row.toAmount) >
                units(
                  row.kind === "AGENCY_REFUND" ? a.agencyRetained : a.available,
                )
              )
                throw stockError(
                  "REFUND_EXCEEDS_FUNDS",
                  "Les fonds disponibles ont chang�.",
                );
            } else if (row.kind === "RECEIPT") {
              const item = a.items.find((i) => i.id === row.remittanceItemId)!;
              remittanceId = item.remittanceId;
              checkVersionAmount(units(item.confirmed), units(row.fromAmount));
              if (
                units(a.confirmed) -
                  units(item.confirmed) +
                  units(row.toAmount) <
                units(a.agencyRefunded)
              )
                throw stockError(
                  "RECEIPT_BELOW_REFUNDED",
                  "La correction ne peut effacer des fonds d�j� rembours�s par l'agence.",
                );
              if (
                units(row.toAmount) >
                units(a.available) + units(item.confirmed)
              )
                throw stockError(
                  "BALANCE_EXCEEDED",
                  "La r�ception corrig�e d�passerait les encaissements valides.",
                );
            }
            await tx.collection.update({
              where: { id: collectionId },
              data: { version: { increment: 1 } },
            });
            await tx.collectionEvent.create({
              data: {
                companyId: row.companyId,
                collectionId,
                actorId: c.actorId,
                status: source.status,
                notes: `${row.kind} approuv� : ${row.reason}`,
              },
            });
          }
        }
        await tx.financialCorrection.update({
          where: { id: row.id },
          data: {
            status: input.approve ? "APPROVED" : "REJECTED",
            decidedById: c.actorId,
            decidedAt: new Date(),
            decisionReason: input.reason,
            version: { increment: 1 },
          },
        });
        if (input.approve && row.courierId && row.kind !== "EXCEPTION")
          await this.addDiscrepancy(tx, c, {
            agencyId: row.agencyId,
            courierId: row.courierId,
            deliveryId: row.deliveryId,
            collectionId: row.collectionId,
            remittanceId,
            kind:
              row.kind === "REFUND" || row.kind === "AGENCY_REFUND"
                ? "REFUND"
                : row.kind === "RECEIPT"
                  ? "RECEIPT_CORRECTION"
                  : "INPUT_ERROR",
            amount: amount(
              units(row.toAmount) > units(row.fromAmount)
                ? units(row.toAmount) - units(row.fromAmount)
                : units(row.fromAmount) - units(row.toAmount),
            ),
            currency: row.currency,
            description: `${row.kind === "REFUND" || row.kind === "AGENCY_REFUND" ? "Remboursement externe" : row.kind === "RECEIPT" ? "Correction de r�ception de fonds" : "Correction financi�re"} approuv�(e) : ${row.reason}`,
            sourceKey: `correction:${row.id}`,
          });
        return {
          id: row.id,
          event: {
            agencyId: row.agencyId,
            courierId: row.courierId,
            orderId: d.orderId,
            collectionId: row.collectionId,
            remittanceId,
            correctionId: row.id,
            action: input.approve
              ? "CORRECTION_APPROVED"
              : "CORRECTION_REJECTED",
            entityId: row.id,
            previousStatus: row.status,
            status: input.approve ? "APPROVED" : "REJECTED",
            amount: row.toAmount,
            currency: row.currency,
            reason: input.reason,
            metadata: {
              kind: row.kind,
              fromAmount: row.fromAmount.toFixed(4),
              toAmount: row.toAmount.toFixed(4),
              requestReason: row.reason,
              exceptional: row.exceptional,
            },
          },
        };
      },
    );
    return this.correctionResult(c, id);
  }
  async reportDiscrepancy(c: Context, input: z.infer<typeof v.discrepancy>) {
    const id = await this.write(
      c,
      "financial.discrepancies.manage",
      input,
      "DISCREPANCY_REPORTED",
      async (tx) => {
        let agencyId: string,
          courierId: string,
          currency: string,
          deliveryId: string | undefined;
        if (input.collectionId) {
          const p = await this.findCollection(tx, c, input.collectionId);
          agencyId = p.agencyId;
          courierId = p.courierId;
          currency = p.currency;
          deliveryId = p.deliveryId;
        } else {
          const p = await this.findRemittance(tx, c, input.remittanceId!);
          agencyId = p.agencyId;
          courierId = p.courierId;
          currency = p.currency;
        }
        agencyAllowed(c, agencyId);
        const d = await this.addDiscrepancy(tx, c, {
          agencyId,
          courierId,
          currency,
          deliveryId,
          collectionId: input.collectionId,
          remittanceId: input.remittanceId,
          kind: input.kind,
          amount: input.amount,
          description: input.description,
        });
        return {
          id: d.id,
          event: {
            agencyId,
            courierId,
            collectionId: d.collectionId,
            remittanceId: d.remittanceId,
            discrepancyId: d.id,
            action: "DISCREPANCY_REPORTED",
            entityId: d.id,
            status: d.status,
            amount: d.amount,
            currency: d.currency,
            reason: d.description,
          },
        };
      },
    );
    return this.discrepancies(c, { page: 1, size: 20 }, id);
  }
  async resolveDiscrepancy(
    c: Context,
    id: string,
    input: z.infer<typeof v.resolution>,
  ) {
    await this.write(
      c,
      "financial.discrepancies.manage",
      { ...input, id },
      "DISCREPANCY_RESOLVED",
      async (tx) => {
        const d = await tx.financialDiscrepancy.findFirst({
          where: { id, companyId: c.companyId },
        });
        if (!d)
          throw stockError("DISCREPANCY_NOT_FOUND", "�cart introuvable.", 404);
        agencyAllowed(c, d.agencyId);
        checkVersion(d.version, input.version);
        if (
          d.status === "CLOSED" ||
          (input.status === "CLOSED" && d.status !== "RESOLVED") ||
          (input.status === "REVIEW" && !["OPEN", "REVIEW"].includes(d.status))
        )
          throw stockError(
            "DISCREPANCY_TRANSITION_DENIED",
            "Cette transition d'�cart est indisponible.",
          );
        await tx.financialDiscrepancy.update({
          where: { id },
          data: {
            status: input.status,
            resolution: input.reason,
            resolvedById: c.actorId,
            resolvedAt: new Date(),
            version: { increment: 1 },
          },
        });
        return {
          id,
          event: {
            agencyId: d.agencyId,
            courierId: d.courierId,
            collectionId: d.collectionId,
            remittanceId: d.remittanceId,
            discrepancyId: d.id,
            action: "DISCREPANCY_RESOLVED",
            entityId: id,
            previousStatus: d.status,
            status: input.status,
            amount: d.amount,
            currency: d.currency,
            reason: input.reason,
          },
        };
      },
    );
    return this.discrepancies(c, { page: 1, size: 20 }, id);
  }
}
function checkVersionAmount(actual: bigint, expected: bigint) {
  if (actual !== expected)
    throw stockError(
      "FINANCIAL_VERSION_CONFLICT",
      "Les montants ont chang� ; une nouvelle demande est n�cessaire.",
    );
}
