/** Shared stock API contracts; quantities are whole items, physical includes reserved. */
export interface StockPage<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
export interface StockEntity {
  id: string;
  name: string;
  reference?: string;
  companyId?: string;
}
export interface CatalogProduct {
  id: string;
  shopId: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  unit: string;
  active: boolean;
  archivedAt: string | null;
  version: number;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  shop: StockEntity;
}
export interface StockSummary {
  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  inTransitQuantity: number;
  lowStockCount: number;
  transferCount: number;
  inventoryVarianceCount: number;
}
export interface StockBalance {
  id: string;
  companyId: string;
  agencyId: string;
  shopId: string;
  productId: string;
  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  inTransitQuantity: number;
  alertThreshold: number;
  version: number;
  company: StockEntity;
  agency: StockEntity;
  shop: StockEntity;
  product: Pick<CatalogProduct, "id" | "name" | "sku" | "unit">;
}
export interface StockMovementDTO {
  id: string;
  companyId: string;
  stockId: string;
  type: string;
  physicalDelta: number;
  reservedDelta: number;
  physicalBefore: number;
  reservedBefore: number;
  physicalAfter: number;
  reservedAfter: number;
  operationKey: string;
  reference?: string;
  notes: string | null;
  createdAt: string;
  stock: StockBalance;
  actor: { id: string; fullName: string };
  reservationId?: string | null;
  transferId?: string | null;
}
export interface StockLine {
  id: string;
  productId: string;
  quantity: number;
  product: Pick<CatalogProduct, "id" | "name" | "sku" | "unit">;
}
export interface StockDeposit {
  id: string;
  companyId: string;
  agencyId: string;
  shopId: string;
  reference: string;
  status: "DRAFT" | "CONFIRMED" | "CANCELLED";
  version: number;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt?: string | null;
  items: StockLine[];
  company?: StockEntity;
  agency: StockEntity;
  shop: StockEntity;
  creator?: { id: string; fullName: string };
  receiver?: { id: string; fullName: string } | null;
}
export interface StockWithdrawal {
  id: string;
  reference: string;
  companyId: string;
  stockId: string;
  quantity: number;
  kind: "RETURN" | "WITHDRAWAL";
  reason: string;
  recipient: string | null;
  createdAt: string;
  stock: StockBalance;
  actor?: { id: string; fullName: string };
}
export interface StockReservationDTO {
  id: string;
  reference: string | null;
  companyId: string;
  stockId: string;
  quantity: number;
  status: "ACTIVE" | "RELEASED" | "CONSUMED";
  version: number;
  notes: string | null;
  createdAt: string;
  releasedAt: string | null;
  consumedAt: string | null;
  stock: StockBalance;
  orderItemId?: string | null;
}
export interface StockTransferItem extends StockLine {
  shopId: string;
  receivedQuantity: number;
  lostQuantity: number;
  returnedQuantity: number;
  inTransitQuantity: number;
}
export interface StockIncident {
  id: string;
  transferId: string;
  itemId: string;
  quantity: number;
  kind: string;
  description: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  resolvedAt?: string | null;
  resolution?: string | null;
  reason?: string | null;
  product?: StockEntity;
}
export interface StockTransfer {
  id: string;
  companyId: string;
  reference: string;
  originAgencyId: string;
  destinationAgencyId: string;
  status: "DRAFT" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  version: number;
  notes: string | null;
  createdAt: string;
  departedAt: string | null;
  receivedAt: string | null;
  originAgency: StockEntity;
  destinationAgency: StockEntity;
  items: StockTransferItem[];
  incidents: StockIncident[];
  events?: Array<{
    id: string;
    status: string;
    notes: string | null;
    createdAt: string;
  }>;
}
export interface InventoryItem {
  id: string;
  stockId: string;
  productId?: string;
  expectedPhysical: number;
  expectedReserved: number;
  stockVersion: number;
  countedQuantity: number | null;
  variance: number | null;
  reason: string | null;
  product: Pick<CatalogProduct, "id" | "name" | "sku" | "unit">;
  stock?: StockBalance;
}
export interface StockInventory {
  id: string;
  companyId: string;
  agencyId: string;
  reference: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  version: number;
  notes: string | null;
  createdAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  agency: StockEntity;
  shop?: StockEntity | null;
  items: InventoryItem[];
}
export interface StockOptions {
  agencies: StockEntity[];
  destinationAgencies: StockEntity[];
  shops: Array<
    StockEntity & {
      collaborationId?: string;
      allowedAgencyIds?: string[] | null;
      version?: number;
    }
  >;
  companies: StockEntity[];
}
export const stockTypeLabels: Record<string, string> = {
  DEPOSIT: "Entrée par dépôt",
  ISSUE: "Sortie physique",
  RESERVE: "Réservation",
  RELEASE: "Libération",
  RETURN: "Retour",
  ADJUSTMENT: "Correction d’inventaire",
  TRANSFER_OUT: "Départ de transfert",
  TRANSFER_IN: "Réception de transfert",
};
export const stockStatusLabels: Record<string, string> = {
  ACTIVE: "Active",
  DRAFT: "Brouillon",
  RECEIVED: "Réceptionné",
  CANCELLED: "Annulé",
  IN_TRANSIT: "En transit",
  SUBMITTED: "Soumis",
  APPROVED: "Validé",
  REJECTED: "Rejeté",
  OPEN: "Ouvert",
  RESOLVED: "Résolu",
  RELEASED: "Libérée",
  CONSUMED: "Consommée",
  OUT_OF_STOCK: "Rupture",
  LOW: "Stock faible",
  AVAILABLE: "Disponible",
};
export const stockModuleIds = [
  "produits",
  "stocks",
  "depots",
  "mouvements",
  "sorties",
  "reservations",
  "transferts-stock",
  "inventaires",
  "alertes-stock",
] as const;
