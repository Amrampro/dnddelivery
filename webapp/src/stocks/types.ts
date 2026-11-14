export interface StockIdentity {
  id: string;
  name: string;
  reference?: string;
  companyId?: string;
  status?: string;
}
export interface StockOptions {
  companies: StockIdentity[];
  agencies: StockIdentity[];
  destinationAgencies?: StockIdentity[];
  shops: StockIdentity[];
}
export interface StockProduct {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
}
export interface StockBalance {
  id: string;
  companyId: string;
  shopId: string;
  agencyId: string;
  productId: string;
  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  inTransitQuantity: number;
  alertThreshold: number;
  version: number;
  company: StockIdentity;
  agency: StockIdentity;
  shop: StockIdentity;
  product: StockProduct;
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
export interface StockMovement {
  id: string;
  type: string;
  physicalDelta: number;
  reservedDelta: number;
  physicalAfter: number;
  reservedAfter: number;
  physicalBefore?: number;
  reservedBefore?: number;
  operationKey: string;
  operationReference?: string;
  reference?: string;
  notes: string | null;
  createdAt: string;
  actor?: { fullName: string };
  stock: StockBalance;
  reservationId?: string | null;
  transferId?: string | null;
}
export interface OperationItem {
  id: string;
  productId: string;
  quantity: number;
  product: StockProduct;
  shopId?: string;
  receivedQuantity?: number;
  lostQuantity?: number;
  returnedQuantity?: number;
  inTransitQuantity?: number;
  stockId?: string;
  expectedPhysical?: number;
  expectedReserved?: number;
  stockVersion?: number;
  countedQuantity?: number | null;
  variance?: number | null;
  reason?: string | null;
  shop?: StockIdentity;
}
export interface TransferIncident {
  id: string;
  itemId: string;
  quantity: number;
  kind: string;
  description: string;
  status: string;
  resolution?: string | null;
  reason?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  product?: StockProduct;
}
export interface StockOperation {
  id: string;
  reference: string;
  status: string;
  version: number;
  companyId: string;
  agencyId?: string;
  shopId?: string;
  originAgencyId?: string;
  destinationAgencyId?: string;
  agency?: StockIdentity;
  shop?: StockIdentity;
  company?: StockIdentity;
  originAgency?: StockIdentity;
  destinationAgency?: StockIdentity;
  items: OperationItem[];
  incidents?: TransferIncident[];
  events?: {
    id: string;
    status: string;
    notes: string | null;
    createdAt: string;
    actor?: { fullName: string } | null;
  }[];
  notes?: string | null;
  reason?: string | null;
  quantity?: number;
  kind?: string;
  recipient?: string | null;
  stock?: StockBalance;
  actor?: { fullName: string };
  createdAt: string;
  confirmedAt?: string | null;
  departedAt?: string | null;
  receivedAt?: string | null;
  submittedAt?: string | null;
  decidedAt?: string | null;
  releasedAt?: string | null;
  consumedAt?: string | null;
}
