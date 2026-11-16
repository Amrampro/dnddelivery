export const financeModuleIds = [
  "encaissements",
  "remises",
  "ecarts-financiers",
  "soldes-livreurs",
  "historique-financier",
  "corrections-financieres",
  "suivi-financier",
];
export const financeStates: Record<string, string> = {
  NOT_REQUIRED: "Aucun encaissement requis",
  PENDING: "En attente d’encaissement",
  PARTIAL: "Encaissement partiel",
  DECLARED_COMPLETE: "Complet déclaré par le livreur",
  NONE_RECEIVED: "Aucun montant reçu",
  EXCESS: "Excédent déclaré",
  REFUNDED: "Remboursement externe documenté",
  DECLARED: "Remise déclarée · réception à confirmer",
  CONFIRMED: "Réception confirmée par l’agence",
  DISPUTED: "Écart / contestation",
  CANCELLED: "Remise rejetée",
  OPEN: "Ouvert",
  REVIEW: "En cours d’examen",
  RESOLVED: "Résolu",
  CLOSED: "Clôturé",
  APPROVED: "Approuvé",
  REJECTED: "Refusé",
  CORRECTION_PENDING: "Correction en attente",
};
export const financeEvents: Record<string, string> = {
  COLLECTION_PARTIAL: "Encaissement partiel déclaré",
  COLLECTION_NONE: "Aucun montant reçu",
  COLLECTION_EXCESS: "Excédent d’encaissement déclaré",
  REMITTANCE_CONFIRMED: "Réception de fonds confirmée",
  REMITTANCE_DISPUTED: "Remise avec écart ou contestation",
  REMITTANCE_REJECTED: "Remise rejetée",
  REMITTANCE_CORRECTION_REQUESTED: "Nouvelle déclaration de remise demandée",
  COLLECTION_DECLARED: "Encaissement déclaré",
  REMITTANCE_DECLARED: "Remise déclarée",
  REMITTANCE_DECIDED: "Décision de réception de fonds",
  CORRECTION_REQUESTED: "Correction ou régularisation demandée",
  CORRECTION_APPROVED: "Correction ou régularisation approuvée",
  CORRECTION_REJECTED: "Demande de correction refusée",
  DISCREPANCY_OPENED: "Écart détecté",
  DISCREPANCY_REPORTED: "Écart signalé",
  DISCREPANCY_RESOLVED: "Suivi de l’écart mis à jour",
  FINANCIAL_EXPECTED_CHANGED: "Montant attendu corrigé avec autorisation",
};
export const paymentMethods = [
  { value: "CASH", label: "Espèces" },
  { value: "MTN_MOBILE_MONEY", label: "MTN Mobile Money externe" },
  { value: "ORANGE_MONEY", label: "Orange Money externe" },
  { value: "BANK_TRANSFER", label: "Virement externe" },
  { value: "OTHER", label: "Autre moyen externe" },
];
export function financeStatusLabel(status: string, correction = false) {
  return correction && status === "PENDING"
    ? "En attente de validation distincte"
    : (financeStates[status] ?? status);
}
export const discrepancyKinds = [
  { value: "PARTIAL", label: "Encaissement partiel" },
  { value: "ZERO", label: "Aucun montant reçu" },
  { value: "OVER_COLLECTION", label: "Excédent d’encaissement" },
  { value: "SHORT_REMITTANCE", label: "Remise insuffisante" },
  { value: "EXCESS_REMITTANCE", label: "Remise excédentaire" },
  { value: "CONTESTED", label: "Déclaration contestée" },
  { value: "INPUT_ERROR", label: "Erreur de saisie" },
  { value: "MISSING_FUNDS", label: "Fonds manquants" },
  { value: "OTHER", label: "Autre écart" },
];
export const correctionKinds: Record<string, string> = {
  COLLECTION: "Corriger une déclaration d’encaissement",
  REFUND: "Documenter un remboursement externe déjà réalisé",
  AGENCY_REFUND: "Documenter un remboursement externe par l’agence",
  EXPECTED: "Corriger le montant attendu",
  RECEIPT: "Corriger une réception de fonds confirmée",
  EXCEPTION: "Documenter une dérogation au paiement complet",
};
export interface FinancePage<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  kind?: string;
  permissions?: string[];
}
export interface FinanceObligation {
  id: string;
  publicNumber: string;
  companyId: string;
  companyName: string;
  agencyId: string;
  agencyName: string;
  shopId: string;
  shopName: string;
  currency: string;
  version: number;
  orderStatus: string;
  createdAt: string;
  collectionRequired: boolean;
  expected: string;
  declared: string;
  remaining: string;
  excess: string;
  gross: string;
  refunded: string;
  state: string;
  disputed: boolean;
  exception: boolean;
  canDeclare: boolean;
  legacyEntries: number;
  mission: {
    id: string;
    version: number;
    phase: string | null;
    pickedUpAt: string | null;
    courierId?: string;
    agencyId?: string;
  } | null;
}
export interface FinanceEvent {
  actorName?: string;
  id: string;
  action: string;
  amount: string;
  currency: string;
  reason?: string | null;
  createdAt: string;
  status?: string | null;
  previousStatus?: string | null;
  metadata?: Record<string, unknown> | null;
  entityId?: string;
}
export interface FinanceNotice {
  id: string;
  sourceEvent: string;
  createdAt: string;
  payload: {
    event?: string;
    action: string;
    amount: string;
    currency: string;
    status?: string | null;
  };
}
export interface FinanceEntry {
  courierRefunded?: string;
  agencyRefunded?: string;
  agencyRetained?: string;
  id: string;
  reference: string | null;
  deliveryId: string;
  orderId: string;
  publicNumber: string;
  shopName?: string;
  companyId: string;
  agencyId?: string;
  courierId?: string;
  courierName?: string;
  currency: string;
  version?: number;
  method?: string | null;
  notes?: string | null;
  declaredAt: string | null;
  expectedSnapshot: string;
  declaredAmount: string | null;
  gross: string;
  refunded: string;
  net: string;
  confirmed?: string;
  reserved?: string;
  liability?: string;
  available?: string;
  blocked?: boolean;
  legacy: boolean;
  items?: Array<{
    id: string;
    remittanceId: string;
    reference: string;
    status: string;
    decision: string | null;
    declared: string;
    confirmed: string;
    reserved: string;
    received: boolean;
  }>;
}
export interface FinanceEntryDetail {
  entry: FinanceEntry;
  events: FinanceEvent[];
  kind: string;
}
export interface FinanceRemittance {
  effectiveConfirmedAmount?: string;
  confirmedByName?: string | null;
  id: string;
  reference: string;
  companyId: string;
  agencyId: string;
  courierId: string;
  courierName: string;
  version: number;
  currency: string;
  status: string;
  decision: string | null;
  decisionReason: string | null;
  declaredAmount: string;
  confirmedAmount: string | null;
  declaredAt: string;
  confirmedAt: string | null;
  notes: string | null;
  legacy: boolean;
  canConfirm?: boolean;
  items?: Array<{
    id: string;
    collectionId: string;
    publicNumber: string;
    reference: string | null;
    declaredAmount: string | null;
    confirmedAmount: string | null;
    effectiveConfirmed: string;
  }>;
  events?: FinanceEvent[];
  permissions?: string[];
}
export interface FinanceCorrection {
  id: string;
  companyId: string;
  agencyId: string;
  courierId: string | null;
  deliveryId: string;
  collectionId: string | null;
  remittanceItemId: string | null;
  kind: string;
  status: string;
  version: number;
  fromAmount: string;
  toAmount: string;
  currency: string;
  reason: string;
  exceptional: boolean;
  externalReference: string | null;
  requestedById: string;
  decidedById: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  createdAt: string;
  canDecide: boolean;
}
export interface FinanceDiscrepancy {
  id: string;
  reference: string;
  companyId: string;
  agencyId: string;
  courierId: string;
  collectionId: string | null;
  remittanceId: string | null;
  kind: string;
  amount: string;
  currency: string;
  description: string;
  status: string;
  version: number;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  canResolve: boolean;
}
export interface FinanceMoney {
  courierRefunded?: string;
  agencyRefunded?: string;
  agencyRetained?: string;
  currency: string;
  expected?: string;
  remaining?: string;
  gross?: string;
  refunded: string;
  net: string;
  confirmed?: string;
  reserved?: string;
  liability?: string;
  available?: string;
  unreconciled?: number;
}
export interface FinanceBalance extends FinanceMoney {
  agencyId: string;
  courierId: string;
  courierName: string;
}
export interface FinanceOverview {
  kind: string;
  permissions: string[];
  money: FinanceMoney[];
  balances: FinanceBalance[];
  pendingRemittances: number;
  openDiscrepancies: number;
}
export interface FinanceOptions {
  agencies: Array<{ id: string; name: string }>;
  companies: Array<{ id: string; name: string }>;
  kind: string;
  permissions: string[];
}
export interface FinanceFormTarget {
  agencies?: { id: string; name: string }[];
  allowAgencyRefund?: boolean;
  currencies?: string[];
  code:
    | "DECLARE"
    | "REMIT"
    | "DECIDE"
    | "CORRECT"
    | "EXPECTED"
    | "EXCEPTION"
    | "RECEIPT"
    | "APPROVE"
    | "REPORT"
    | "RESOLVE";
  obligation?: FinanceObligation;
  entry?: FinanceEntry;
  remittance?: FinanceRemittance;
  correction?: FinanceCorrection;
  discrepancy?: FinanceDiscrepancy;
  receiptItemId?: string;
  entries?: FinanceEntry[];
  agencyId?: string;
  currency?: string;
}
export function exactUnits(value: string) {
  if (!/^\d{1,15}(\.\d{1,4})?$/.test(value))
    throw Error(
      "Saisissez un montant positif ou nul avec un point décimal et au plus quatre décimales.",
    );
  const [w, f = ""] = value.split(".");
  return BigInt(w!) * 10000n + BigInt(f.padEnd(4, "0"));
}
export function decimal(value: bigint) {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${abs / 10000n}.${(abs % 10000n).toString().padStart(4, "0")}`;
}
export function financialMoney(value: string | undefined, currency: string) {
  if (value === undefined) return "—";
  const raw = value.startsWith("-") ? value.slice(1) : value;
  if (!/^\d+(\.\d{1,4})?$/.test(raw))
    throw Error("Montant financier invalide.");
  const [w, f = ""] = raw.split(".");
  const negative = value.startsWith("-"),
    u = BigInt(w!) * 10000n + BigInt(f.padEnd(4, "0")),
    whole = (u / 10000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "),
    fraction = (u % 10000n).toString().padStart(4, "0").replace(/0+$/, "");
  return `${negative ? "−" : ""}${whole}${fraction ? "," + fraction : ""} ${currency}`;
}
export function correctionSummary(
  x: Pick<FinanceCorrection, "kind" | "fromAmount" | "toAmount" | "currency">,
) {
  if (x.kind === "EXCEPTION")
    return `Attendu : ${financialMoney(x.fromAmount, x.currency)} · Net déclaré constaté : ${financialMoney(x.toAmount, x.currency)}`;
  if (x.kind.endsWith("REFUND"))
    return `Remboursement externe effectué ${x.kind === "AGENCY_REFUND" ? "par l’agence" : "par le livreur"} : ${financialMoney(x.toAmount, x.currency)}`;
  return `Valeur d’origine : ${financialMoney(x.fromAmount, x.currency)} → valeur corrigée demandée : ${financialMoney(x.toAmount, x.currency)}`;
}
