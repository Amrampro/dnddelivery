import { deliveryEvents } from "./deliveries.ts";
export function communicationLabel(event: string) {
  return (
    (
      {
        ORDER_SUBMITTED: "Commande enregistrée",
        ORDER_CANCELLED: "Commande annulée",
        TRACKING_ACCESS: "Lien personnel de suivi",
      } as Record<string, string>
    )[event] ??
    deliveryEvents[event.replace(/^DELIVERY_/, "")] ??
    "Mise à jour du suivi"
  );
}
export const confirmationLabels: Record<string, string> = {
  PENDING: "Code à vérifier",
  VERIFIED: "Code validé · preuves et clôture requises",
  EXPIRED: "Code expiré",
  LOCKED: "Code temporairement bloqué",
  REVOKED: "Accès invalidé",
  CONSUMED: "Validation utilisée",
  APPROVED: "Exception approuvée",
  REJECTED: "Exception refusée",
  READY: "Photo reçue par le serveur",
  ATTACHED: "Photo attachée à la preuve finale",
  RETIRED: "Photo historique · nouvelle photo requise pour la remise",
  ACCEPTED: "Accepté par le fournisseur",
  PROCESSING: "Envoi en cours",
  FAILED: "Échec d’envoi",
  RETRY_SCHEDULED: "Nouvelle tentative programmée",
  CANCELLED: "Envoi annulé",
};
export interface ConfirmationInfo {
  id: string;
  version: number;
  status: string;
  phase: string | null;
  eligible: boolean;
  permissions: string[];
  kind: string;
  canVerify: boolean;
  canUpload: boolean;
  canRenew: boolean;
  canApprove: boolean;
  canManageTracking: boolean;
  otp: null | {
    status: string;
    expiresAt: string;
    expired?: boolean;
    verifiedAt: string | null;
    validationExpiresAt: string | null;
    attempts?: number;
    maxAttempts?: number;
    current: boolean;
  };
  proof: null | {
    legacy?: boolean;
    id: string;
    method: string;
    createdAt: string;
    exceptionReason?: string | null;
  };
  evidence: Array<{
    id: string;
    kind: string;
    status: string;
    createdAt: string;
    current: boolean;
    fileUrl: string;
  }>;
  exceptions: Array<{
    id: string;
    status: string;
    version: number;
    reason: string;
    decisionReason: string | null;
    createdAt: string;
    decidedAt: string | null;
    expiresAt: string;
    expired?: boolean;
    current: boolean;
    canDecide: boolean;
    decidedByName?: string;
  }>;
}
export interface DeliveryCommunication {
  id: string;
  event: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  acceptedAt: string | null;
  nextAttemptAt: string | null;
}
export interface PublicTracking {
  reference: string;
  company: string;
  shop: string;
  status: string;
  phase?: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  otpAvailable: boolean;
  failure: string | null;
  events: Array<{ id: string; label: string; createdAt: string }>;
  refreshedAt: string;
}
export function confirmationChoice(
  p: ConfirmationInfo,
  selected: string[],
  exceptionId?: string,
) {
  const rows = p.evidence.filter(
    (e) =>
      e.current &&
      e.status === "READY" &&
      e.kind === "HANDOVER" &&
      selected.includes(e.id),
  );
  if (!p.eligible) throw Error("Cette mission n’est plus en phase de remise.");
  if (
    rows.length !== selected.length ||
    new Set(selected).size !== selected.length ||
    !rows.length ||
    rows.length > 5
  )
    throw Error("Sélectionnez une à cinq photos actuelles de remise.");
  if (exceptionId) {
    if (
      !p.exceptions.some(
        (e) =>
          e.id === exceptionId &&
          e.current &&
          !e.expired &&
          e.status === "APPROVED",
      ) ||
      rows.length < 2
    )
      throw Error(
        "L’exception doit être approuvée et accompagnée de deux photos différentes.",
      );
  } else if (p.otp?.status !== "VERIFIED" || !p.otp.current)
    throw Error("Faites valider le code du destinataire avant la clôture.");
  return { evidenceIds: selected, ...(exceptionId ? { exceptionId } : {}) };
}
