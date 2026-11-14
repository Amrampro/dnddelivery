import type { Product } from "./CatalogScreen";
import type {
  StockBalance,
  StockMovementDTO,
  StockOptions,
} from "../../../shared/stocks";
export interface Named {
  id: string;
  name: string;
  reference?: string;
  companyId?: string;
}
export interface Options extends StockOptions {
  companies: Named[];
  agencies: Named[];
  destinationAgencies: Named[];
  shops: Named[];
}
export type Stock = StockBalance;
export interface Item {
  id: string;
  productId: string;
  quantity: number;
  product: Pick<Product, "id" | "name" | "sku" | "unit">;
  receivedQuantity?: number;
  lostQuantity?: number;
  returnedQuantity?: number;
  inTransitQuantity?: number;
  expectedPhysical?: number;
  expectedReserved?: number;
  countedQuantity?: number | null;
  variance?: number | null;
  reason?: string | null;
}
export interface Incident {
  id: string;
  itemId: string;
  quantity: number;
  kind: string;
  description: string;
  status: string;
  createdAt: string;
  resolution?: string | null;
  product?: Product;
}
export interface Operation {
  id: string;
  reference: string;
  status: string;
  version: number;
  companyId: string;
  agencyId?: string;
  shopId?: string;
  originAgencyId?: string;
  destinationAgencyId?: string;
  agency?: Named;
  company?: Named;
  shop?: Named;
  originAgency?: Named;
  destinationAgency?: Named;
  stock?: Stock;
  product?: Product;
  quantity?: number;
  kind?: string;
  reason?: string | null;
  recipient?: string | null;
  notes?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
  receivedAt?: string | null;
  departedAt?: string | null;
  actor?: { id: string; fullName: string } | null;
  dispatchedAt?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  items?: Item[];
  incidents?: Incident[];
  logs?: {
    id: string;
    status: string;
    notes?: string | null;
    createdAt: string;
  }[];
  events?: {
    id: string;
    status: string;
    notes?: string | null;
    createdAt: string;
  }[];
}
export type Movement = StockMovementDTO & {
  quantity: number;
  reference?: string;
  operationReference?: string | null;
  reason?: string | null;
};
export type OperationKind =
  "depots" | "sorties" | "reservations" | "transferts-stock" | "inventaires";
export const paths: Record<OperationKind, string> = {
  depots: "/stock-deposits",
  sorties: "/stock-withdrawals",
  reservations: "/stock-reservations",
  "transferts-stock": "/stock-transfers",
  inventaires: "/inventories",
};
export const titles: Record<OperationKind, string> = {
  depots: "Dépôts",
  sorties: "Sorties",
  reservations: "Réservations",
  "transferts-stock": "Transferts inter-agences",
  inventaires: "Inventaires",
};
export const creationTitles: Record<OperationKind, string> = {
  depots: "Préparer un dépôt",
  sorties: "Enregistrer une sortie",
  reservations: "Réserver du stock",
  "transferts-stock": "Préparer un transfert",
  inventaires: "Nouvel inventaire",
};
export const writePermissions: Record<OperationKind, string> = {
  depots: "stocks.deposit",
  sorties: "stocks.withdraw",
  reservations: "stocks.reserve",
  "transferts-stock": "stocks.transfer",
  inventaires: "stocks.inventory",
};
