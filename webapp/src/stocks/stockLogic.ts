import type { Workspace } from "../auth/types";
export const stockDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString("fr-FR") : "—";
export const quantity = (value: number | string | undefined | null) =>
  value == null ? "—" : Number(value).toLocaleString("fr-FR");
export const stockLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING: "En attente",
  CONFIRMED: "Réceptionné",
  RECEIVED: "Réceptionné",
  CANCELLED: "Annulé",
  ACTIVE: "Active",
  ARCHIVED: "Archivé",
  IN_TRANSIT: "En transit",
  PARTIALLY_RECEIVED: "Réception partielle",
  COMPLETED: "Terminé",
  OPEN: "Ouvert",
  RESOLVED: "Clôturé",
  REJECTED: "Rejeté",
  SUBMITTED: "À valider",
  APPROVED: "Validé",
  RELEASED: "Libérée",
  CONSUMED: "Consommée",
  RESERVED: "Réservée",
  DEPOSIT: "Entrée par dépôt",
  ISSUE: "Sortie",
  RESERVE: "Réservation",
  RELEASE: "Libération",
  ADJUSTMENT: "Correction d’inventaire",
  RETURN: "Retour",
  TRANSFER_OUT: "Départ de transfert",
  TRANSFER_IN: "Réception de transfert",
  OUT_OF_STOCK: "Rupture",
  LOW: "Stock faible",
  NORMAL: "Disponible",
  RESTITUTION: "Restitution à la boutique",
  PICKUP: "Retrait autorisé",
  OTHER: "Autre sortie",
  MISSING: "Article manquant",
  DAMAGED: "Article endommagé",
  REFUSED: "Réception refusée",
  QUANTITY_MISMATCH: "Écart de quantité",
  LOSS: "Perte validée",
  RETURN_TO_ORIGIN: "Retour à l’origine",
  COUNTING: "Comptage en cours",
};
export interface StockFilters {
  q: string;
  companyId: string;
  agencyId: string;
  shopId: string;
  productId: string;
  status: string;
  low: boolean;
  page: number;
}
export function stockQuery(f: StockFilters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== "" && v !== false) p.set(k, String(v));
  }
  return p.toString();
}
export function canWrite(context: Workspace, permission: string) {
  return (
    context.scope !== "SHOP" &&
    context.permissions.includes(permission) &&
    context.subscriptionAccess?.valid !== false
  );
}
