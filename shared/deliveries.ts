export const deliveryPhases: Record<string, string> = {
  WAITING_COLLECTION: "En attente de collecte",
  AT_AGENCY: "Colis en agence",
  PREPARED: "Colis préparé",
  WITH_COURIER: "Remis au livreur",
  IN_TRANSIT: "En acheminement",
  INTER_AGENCY_TRANSIT: "En transit inter-agences",
  ARRIVED_AGENCY: "En attente de réception en agence",
  FINAL_DISTRIBUTION: "En distribution finale",
  AT_DESTINATION: "Arrivé chez le destinataire",
  AWAITING_PROOF: "Confirmation de remise attendue",
  DELIVERED: "Remis au destinataire",
  FAILED: "Tentative échouée · décision attendue",
  RETURN_REQUESTED: "Retour demandé",
  RETURNING: "Retour en cours",
  RETURN_ARRIVED: "Retour arrivé · réception attendue",
  RETURN_RECEIVED: "Retour réceptionné",
  QUARANTINED: "Retour isolé pour contrôle",
  RETURNED_TO_SHOP: "Restitué à la boutique",
  CANCELLED: "Mission annulée",
};
export const deliveryEvents: Record<string, string> = {
  OTP_VERIFIED: "Code de remise validé",
  OTP_RENEWED: "Code renouvelé et envoi demandé",
  PHOTO_UPLOADED: "Photo de preuve reçue",
  OTP_EXCEPTION_REQUESTED: "Exception sans OTP demandée",
  OTP_EXCEPTION_DECIDED: "Décision sur l’exception sans OTP",
  TRACKING_RENEWED: "Accès destinataire renouvelé",
  COMPLETED: "Remise finale confirmée avec preuves",
  FINANCIAL_EXPECTED_CHANGED: "Montant attendu corrigé avec autorisation",
  CREATED: "Mission créée",
  ASSIGNED: "Mission affectée",
  REASSIGNED: "Mission réaffectée",
  HANDOVER_REQUESTED: "Transfert de garde demandé",
  HANDOVER_ACCEPTED: "Transfert de garde accepté",
  HANDOVER_REJECTED: "Transfert de garde refusé",
  HANDOVER_CANCELLED: "Proposition de remise annulée",
  PREPARED: "Colis préparé",
  PICKED_UP: "Colis pris en charge",
  DEPARTED: "Début de l’acheminement",
  ARRIVED_AGENCY: "Arrivée en agence déclarée",
  AGENCY_RECEIVED: "Colis reçu en agence",
  FINAL_DISTRIBUTION: "Distribution finale commencée",
  ARRIVED: "Arrivée chez le destinataire",
  ATTEMPT: "Tentative de remise enregistrée",
  ATTEMPT_FAILED: "Échec de la tentative",
  INCIDENT: "Incident déclaré",
  INCIDENT_RESOLVED: "Incident traité",
  RETRY: "Nouvelle tentative autorisée",
  TRANSFER_CREATED: "Acheminement préparé",
  TRANSFER_DISPATCHED: "Départ inter-agences",
  TRANSFER_RECEIVED: "Réception inter-agences",
  TRANSFER_RETURNED: "Retour du transport reçu à l’origine",
  TRANSFER_CANCELLED: "Acheminement abandonné",
  RETURN_REQUESTED: "Retour demandé",
  RETURN_STARTED: "Retour engagé",
  RETURN_ARRIVED: "Arrivée du retour déclarée",
  RETURN_RECEIVED: "Retour réceptionné et contrôlé",
  RESTOCKED: "Marchandises réintégrées après contrôle",
  RETURNED_TO_SHOP: "Colis restitué à la boutique",
  CANCELLED: "Mission annulée",
};
export const incidentReasons: Record<string, string> = {
  ABSENT: "Destinataire absent",
  UNREACHABLE: "Numéro injoignable",
  OTP_UNAVAILABLE:"Code de remise impossible à obtenir",
  ADDRESS_NOT_FOUND: "Adresse introuvable",
  REFUSED: "Colis refusé",
  DAMAGED: "Colis endommagé",
  TRANSPORT: "Problème de transport",
  OTHER: "Autre motif",
};
export const deliveryStates: Record<string, string> = {
  PENDING: "En attente",
  ASSIGNED: "Affectée",
  IN_PROGRESS: "En cours",
  FAILED: "Échec",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
};
export const custodyLabels: Record<string, string> = {
  RECIPIENT: "Destinataire",
  SHOP: "Boutique",
  AGENCY: "Agence",
  COURIER: "Livreur",
  TRANSPORT: "Agent de transport",
};
export const deliveryModuleIds = [
  "confirmations",
  "livraisons",
  "affectations",
  "courses",
  "incidents",
  "retours",
  "acheminements",
  "suivi",
];
export interface DeliveryContext {
  actorId: string;
  scope: "COMPANY" | "AGENCY" | "SHOP";
  companyId?: string;
  agencyId?: string;
  shopId?: string;
}
export interface DeliveryPerson {
  id: string;
  fullName: string;
}
export interface DeliveryMission {
  actions: string[];
  id: string;
  companyId: string;
  orderId: string;
  agencyId: string;
  courierId: string | null;
  status: string;
  phase: string | null;
  version: number;
  parcelReference: string | null;
  pickedUpAt: string | null;
  assignedAt: string | null;
  closedAt: string | null;
  stockIssuedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  custody: {
    type: string | null;
    agencyId: string | null;
    userId?: string | null;
    holder?: string | null;
    agencyName?: string | null;
  };
  company: { id: string; name: string };
  agency: { id: string; name: string };
  courier?: DeliveryPerson | null;
  order: {
    id: string;
    publicNumber: string;
    type: string;
    status: string;
    shopId: string;
    agencyId: string;
    shopName: string;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
    recipientCity: string;
    recipientCountry: string;
    recipientDetails: Record<string, unknown> | null;
    pickup: {
      address: string;
      contact: string;
      phone: string;
      instructions?: string;
    } | null;
    parcelDescription: string | null;
    notes: string | null;
    collectionRequired: boolean;
    amountToCollect?: string;
    currency?: string;
    items: Array<{
      id: string;
      name: string;
      sku: string | null;
      quantity: number;
      reservations: Array<{ id: string; quantity: number; status: string }>;
    }>;
  };
  assignments: Array<{
    id: string;
    courierId: string;
    agencyId: string;
    purpose: string;
    reason: string | null;
    createdAt: string;
    endedAt: string | null;
    courierName: string;
  }>;
  legs: ParcelLegDTO[];
  handovers: ParcelHandoverDTO[];
  attempts: Array<{
    id: string;
    result: string;
    reason: string | null;
    notes: string | null;
    createdAt: string;
    courierId?: string;
  }>;
  incidents: DeliveryIncidentDTO[];
  parcelReturn: DeliveryReturnDTO | null;
  permissions: string[];
  kind: "operator" | "driver" | "shop";
}
export interface ParcelLegDTO {
  receivedAgencyId: string | null;
  returnedToOrigin: boolean;
  id: string;
  originAgencyId: string;
  destinationAgencyId: string;
  transporterId: string;
  status: string;
  version: number;
  isReturn: boolean;
  dispatchedAt: string | null;
  receivedAt: string | null;
  condition: string | null;
  notes: string | null;
  originName: string;
  destinationName: string;
  transporterName?: string;
}
export interface ParcelHandoverDTO {
  id: string;
  deliveryId: string;
  fromCourierId: string;
  targetCourierId: string;
  status: string;
  reason: string;
  condition: string | null;
  createdAt: string;
  confirmedAt: string | null;
  version: number;
  targetName?: string;
}
export interface DeliveryIncidentDTO {
  id: string;
  kind: string;
  description: string;
  status: string;
  blocking: boolean;
  decision: string | null;
  resolutionReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  version: number;
}
export interface DeliveryReturnDTO {
  id: string;
  agencyId: string;
  status: string;
  reason: string;
  condition: string | null;
  receivedAt: string | null;
  reintegratedAt: string | null;
  returnedToShopAt: string | null;
  createdAt: string;
}
export interface DeliveryHistoryEvent {
  id: string;
  action: string;
  status: string;
  previousStatus: string | null;
  fromPhase: string | null;
  toPhase: string | null;
  createdAt: string;
  agencyId: string | null;
  actor?: { fullName: string };
  reason?: string | null;
  notes?: string | null;
  fromCustody?: {
    type: string;
    agencyId: string | null;
    userId: string | null;
  };
  toCustody?: { type: string; agencyId: string | null; userId: string | null };
  metadata?: Record<string, unknown> | null;
}
export interface DeliveryPage<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  summary?: {
    waiting: number;
    active: number;
    failures: number;
    returns: number;
  };
}
export interface EligibleDriver {
  agencyLinked?: boolean;
  id: string;
  fullName: string;
  availability: string;
  status: string;
  activeMissions: number;
  eligible: boolean;
}
export interface DispatchOrder {
  id: string;
  publicNumber: string;
  version: number;
  type: string;
  agencyId: string;
  shopId: string;
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  pickup: { address: string; contact: string; phone: string } | null;
  parcelDescription: string | null;
  agency: { id: string; name: string };
  collaboration: { shop: { name: string } };
}
export interface DeliveryOptions {
  destinationAgencies: Array<{ id: string; name: string; companyId: string }>;
  agencies: Array<{ id: string; name: string; companyId: string }>;
  companies: Array<{ id: string; name: string }>;
}
export interface PendingHandover {
  id: string;
  deliveryId: string;
  version: number;
  deliveryVersion: number;
  reason: string;
  createdAt: string;
  parcelReference: string | null;
  publicNumber: string;
  fromName: string;
  agencyName: string;
}
export const navigationLink = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
