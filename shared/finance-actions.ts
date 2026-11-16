import type { FinanceFormTarget } from "./finance";
import { exactUnits, decimal } from "./finance.ts";
export interface FinanceValues {
  agencyId: string;
  amount: string;
  method: string;
  reason: string;
  notes: string;
  kind: string;
  externalReference: string;
  decision: string;
  approve: boolean;
  status: string;
  currency: string;
  lines: Record<string, string>;
  acknowledged: boolean;
}
export const financeActionTitles: Record<FinanceFormTarget["code"], string> = {
  DECLARE: "Déclarer l’argent reçu",
  REMIT: "Déclarer une remise physique",
  DECIDE: "Constater la réception des fonds",
  CORRECT: "Demander une correction ou un remboursement externe",
  EXPECTED: "Demander la correction du montant attendu",
  EXCEPTION: "Documenter une dérogation au paiement complet",
  RECEIPT: "Demander une correction de réception",
  APPROVE: "Décider de la régularisation",
  REPORT: "Signaler un écart financier",
  RESOLVE: "Mettre à jour le suivi de l’écart",
};
export const financeActionCopy: Record<FinanceFormTarget["code"], string> = {
  DECLARE:
    "Déclarez uniquement le montant réellement reçu hors plateforme. Cette déclaration ne confirme ni la réception par l’agence ni la livraison définitive.",
  REMIT:
    "Sélectionnez les encaissements et les montants déjà remis physiquement à cette agence. Votre dette reste affichée jusqu’à confirmation des sommes constatées par l’agence.",
  DECIDE:
    "Saisissez le montant réellement constaté pour chaque ligne. Avec écart, seuls ces montants seront reconnus reçus ; le solde reste à justifier. Rejet ou demande de correction ne confirme aucun fonds.",
  CORRECT:
    "La déclaration d’origine restera intacte. Une autre personne autorisée doit approuver la demande avant tout effet sur les soldes. Un remboursement décrit exclusivement une restitution déjà réalisée hors plateforme.",
  EXPECTED:
    "La commande reste la source du montant attendu. Une seconde personne doit approuver. Après enlèvement, une autorisation exceptionnelle d’administrateur est nécessaire.",
  EXCEPTION:
    "Cette décision ne diminue pas le montant attendu et ne fournit aucune preuve de livraison. Elle documente seulement l’exception autorisée pour la revue de la mission.",
  RECEIPT:
    "La réception validée ne sera pas réécrite. Une correction approuvée séparément ajustera le solde traçable.",
  APPROVE:
    "Comparez les montants et le motif d’origine. Le demandeur et le livreur concerné ne peuvent pas approuver eux-mêmes. La décision est historisée.",
  REPORT:
    "Le signalement conserve son montant, son auteur et sa description. Il ne modifie pas automatiquement la dette.",
  RESOLVE:
    "Expliquez les vérifications et la décision. Résoudre un écart ne supprime ni une dette ni les déclarations ; utilisez une régularisation approuvée si les montants sont erronés.",
};
export function initialFinanceValues(t: FinanceFormTarget): FinanceValues {
  return {
    amount:
      t.code === "DECLARE"
        ? (t.obligation?.remaining ?? "")
        : t.code === "EXPECTED"
          ? (t.obligation?.expected ?? "")
          : t.code === "RECEIPT"
            ? (t.remittance?.items?.find((i) => i.id === t.receiptItemId)
                ?.effectiveConfirmed ?? "")
            : t.code === "CORRECT"
              ? (t.entry?.gross ?? "")
              : "",
    agencyId: t.agencyId ?? "",
    method: "CASH",
    reason: "",
    notes: "",
    kind: t.code === "CORRECT" ? "COLLECTION" : "OTHER",
    externalReference: "",
    decision: "CONFIRM",
    approve: true,
    status: t.discrepancy?.status === "RESOLVED" ? "CLOSED" : "REVIEW",
    currency:
      t.currency ??
      t.entry?.currency ??
      t.remittance?.currency ??
      t.obligation?.currency ??
      t.entries?.find(
        (e) => !e.legacy && !e.blocked && exactUnits(e.available ?? "0") > 0n,
      )?.currency ??
      t.currencies?.[0] ??
      "",
    lines:
      t.code === "DECIDE"
        ? Object.fromEntries(
            (t.remittance?.items ?? []).map((i) => [
              i.id,
              i.declaredAmount ?? "0",
            ]),
          )
        : {},
    acknowledged: false,
  };
}
export function financeRequest(
  t: FinanceFormTarget,
  v: FinanceValues,
  operationKey: string,
) {
  v = {
    ...v,
    amount: v.amount.trim().replace(",", "."),
    lines: Object.fromEntries(
      Object.entries(v.lines).map(([id, value]) => [
        id,
        value.trim().replace(",", "."),
      ]),
    ),
  };
  if (!v.acknowledged)
    throw Error("Confirmez avoir vérifié cette déclaration ou décision.");
  const base = { operationKey },
    reason = v.reason.trim(),
    notes = v.notes.trim() || undefined,
    requiredReason = () => {
      if (reason.length < 3)
        throw Error("Indiquez un motif de trois caractères au minimum.");
      return reason;
    };
  if (t.code === "DECLARE") {
    if (!t.obligation?.mission)
      throw Error("Mission introuvable. Actualisez la fiche.");
    const n = exactUnits(v.amount);
    if (n === 0n || n > exactUnits(t.obligation.remaining)) requiredReason();
    return {
      path: "/driver/collections",
      body: {
        ...base,
        deliveryId: t.obligation.mission.id,
        deliveryVersion: t.obligation.mission.version,
        amount: v.amount,
        method: v.method,
        notes,
        ...(reason ? { reason } : {}),
      },
    };
  }
  if (t.code === "REMIT") {
    const items = Object.entries(v.lines)
      .filter(([, x]) => x !== "")
      .map(([id, x]) => {
        const entry = t.entries?.find((e) => e.id === id);
        if (
          !entry ||
          entry.legacy ||
          entry.blocked ||
          entry.currency !== v.currency
        )
          throw Error(
            "Un encaissement sélectionné n’est plus utilisable dans cette devise.",
          );
        const n = exactUnits(x);
        if (n <= 0n || n > exactUnits(entry.available ?? "0"))
          throw Error("Un montant dépasse les fonds disponibles ou est nul.");
        return { collectionId: id, amount: x };
      });
    const agencyIds = new Set(
      items.map(
        (i) =>
          t.entries?.find((e) => e.id === i.collectionId)?.agencyId ??
          t.agencyId,
      ),
    );
    const agencyId = v.agencyId || [...agencyIds][0];
    if (
      agencyIds.size > 1 ||
      (v.agencyId && [...agencyIds][0] !== v.agencyId) ||
      (t.agencyId && agencyId !== t.agencyId)
    )
      throw Error(
        "Une remise doit concerner une seule agence. Sélectionnez séparément les encaissements de chaque agence.",
      );
    if (!items.length || !agencyId)
      throw Error("Sélectionnez les montants à remettre à votre agence.");
    return {
      path: "/driver/cash-remittances",
      body: {
        ...base,
        agencyId,
        currency: v.currency,
        items,
        notes,
      },
    };
  }
  if (t.code === "DECIDE") {
    if (!t.remittance) throw Error("Remise introuvable.");
    const items = ["CONFIRM", "DISPUTE"].includes(v.decision)
      ? (t.remittance.items ?? []).map((i) => {
          const x = v.lines[i.id] ?? "";
          exactUnits(x);
          if (
            v.decision === "CONFIRM" &&
            exactUnits(x) !== exactUnits(i.declaredAmount ?? "0")
          )
            throw Error(
              "Choisissez une réception avec écart si les montants diffèrent.",
            );
          return { id: i.id, confirmedAmount: x };
        })
      : [];
    return {
      path: `/cash-remittances/${t.remittance.id}/decision`,
      body: {
        ...base,
        version: t.remittance.version,
        decision: v.decision,
        reason: requiredReason(),
        items,
      },
    };
  }
  if (["CORRECT", "EXPECTED", "EXCEPTION", "RECEIPT"].includes(t.code)) {
    const kind = t.code === "CORRECT" ? v.kind : t.code,
      amount = t.code === "EXCEPTION" ? "0" : v.amount;
    exactUnits(amount);
    if (kind === "AGENCY_REFUND" && !t.allowAgencyRefund)
      throw Error(
        "Ce remboursement doit être déclaré par un responsable d’agence autorisé.",
      );
    if (
      ["REFUND", "AGENCY_REFUND"].includes(kind) &&
      !v.externalReference.trim()
    )
      throw Error(
        "Précisez la référence ou le constat du remboursement externe déjà réalisé.",
      );
    return {
      path: "/financial-corrections",
      body: {
        ...base,
        kind,
        amount,
        reason: requiredReason(),
        ...(t.code === "CORRECT"
          ? { collectionId: t.entry?.id }
          : t.code === "RECEIPT"
            ? { remittanceItemId: t.receiptItemId }
            : { deliveryId: t.obligation?.mission?.id }),
        ...(v.externalReference.trim()
          ? { externalReference: v.externalReference.trim() }
          : {}),
      },
    };
  }
  if (t.code === "APPROVE")
    return {
      path: `/financial-corrections/${t.correction!.id}/decision`,
      body: {
        ...base,
        version: t.correction!.version,
        approve: v.approve,
        reason: requiredReason(),
      },
    };
  if (t.code === "REPORT") {
    exactUnits(v.amount);
    return {
      path: "/financial-discrepancies",
      body: {
        ...base,
        ...(t.entry
          ? { collectionId: t.entry.id }
          : { remittanceId: t.remittance?.id }),
        kind: v.kind,
        amount: v.amount,
        description: requiredReason(),
      },
    };
  }
  if (t.code === "RESOLVE")
    return {
      path: `/financial-discrepancies/${t.discrepancy!.id}/resolve`,
      body: {
        ...base,
        version: t.discrepancy!.version,
        status: v.status,
        reason: requiredReason(),
      },
    };
  throw Error("Action financière inconnue.");
}
export function selectedRemittanceTotal(v: FinanceValues) {
  return decimal(
    Object.values(v.lines)
      .filter((x) => x !== "")
      .map((value) => exactUnits(value.trim().replace(",", ".")))
      .reduce((a, b) => a + b, 0n),
  );
}
