export interface OrderRecipient {
  name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  district?: string;
  landmark?: string;
  accessInstructions?: string;
  desiredDeliveryAt?: string;
  observations?: string;
  latitude?: number;
  longitude?: number;
}
export interface OrderLine {
  productId?: string;
  name: string;
  sku?: string;
  description?: string;
  instructions?: string;
  quantity: number;
  declaredValue?: string;
}
export interface OrderContent {
  companyId: string;
  shopId: string;
  agencyId: string;
  type: "ONE_OFF" | "FROM_STOCK";
  recipient: OrderRecipient;
  recipientId?: string;
  saveRecipient: boolean;
  items: OrderLine[];
  pickup?: {
    address: string;
    contact: string;
    phone: string;
    instructions?: string;
  };
  parcelDescription: string;
  collectionRequired: boolean;
  amountToCollect: string;
  currency: string;
  financialNotes?: string;
  notes?: string;
}
export interface OrderDTO extends Omit<
  OrderContent,
  "recipient" | "items" | "saveRecipient"
> {
  id: string;
  publicNumber: string;
  version: number;
  status: string;
  isDraft: boolean;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  company: { id: string; name: string };
  agency: { id: string; name: string };
  collaboration: { shop: { id: string; name: string } };
  creator: { id: string; fullName: string };
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientCity: string;
  recipientCountry: string;
  recipientDetails: OrderRecipient | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  orderItem_orderRecords: Array<
    Omit<
      OrderLine,
      "productId" | "sku" | "description" | "instructions" | "declaredValue"
    > & {
      id: string;
      productId: string | null;
      sku: string | null;
      description: string | null;
      instructions: string | null;
      declaredValue: string | null;
      stockReservation_orderItemRecords: Array<{
        id: string;
        quantity: number;
        status: string;
        stockId: string;
      }>;
    }
  >;
}
export interface OrderEvent {
  id: string;
  action: string;
  status: string;
  previousStatus: string | null;
  createdAt: string;
  actor: { fullName: string };
  metadata: Record<string, unknown> | null;
}
export interface OrderPage<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  summary?: { drafts: number; pending: number; cancelled: number };
}
export interface OrderOptions {
  pairs: Array<{
    companyId: string;
    shopId: string;
    company: { id: string; name: string };
    shop: { id: string; name: string };
    allowedAgencyIds: string[];
  }>;
  agencies: Array<{ id: string; name: string; companyId: string }>;
}
export interface OrderProduct {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  availableQuantity: number;
}
export interface RecipientDTO {
  id: string;
  companyId: string;
  shopId: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  country: string;
  details: OrderRecipient;
  version: number;
}
export const orderModuleIds = ["commandes", "nouvelle-commande", "brouillons"];
export function orderPayload(x: OrderContent) {
  return {
    ...x,
    recipient: {
      ...x.recipient,
      ...(x.recipient.desiredDeliveryAt
        ? {
            desiredDeliveryAt: new Date(
              x.recipient.desiredDeliveryAt,
            ).toISOString(),
          }
        : {}),
    },
    pickup: x.type === "ONE_OFF" ? x.pickup : undefined,
  };
}
export function localDeliveryTime(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function orderChanges(
  metadata: Record<string, unknown> | null,
): string[] {
  const old = metadata?.previous as Record<string, unknown> | undefined,
    next = metadata?.next as Record<string, unknown> | undefined;
  if (!old || !next) return [];
  const lines: string[] = [];
  if (old.agencyId !== next.agencyId)
    lines.push("Agence de prise en charge modifiée.");
  if (old.type !== next.type)
    lines.push(
      `Type : ${next.type === "FROM_STOCK" ? "depuis stock" : "ponctuelle"}.`,
    );
  if (
    String(old.amountToCollect) !== String(next.amountToCollect) ||
    old.currency !== next.currency ||
    old.collectionRequired !== next.collectionRequired
  )
    lines.push(
      `Encaissement attendu : ${String(old.amountToCollect)} ${String(old.currency ?? "")} → ${String(next.amountToCollect)} ${String(next.currency ?? "")}.`,
    );
  const describe = (value: unknown) =>
    Array.isArray(value)
      ? value.map((i) => `${i.quantity} × ${i.name}`).join(", ")
      : "";
  if (JSON.stringify(old.items) !== JSON.stringify(next.items))
    lines.push(`Articles : ${describe(old.items)} → ${describe(next.items)}.`);
  const labels: Record<string, string> = {
    notes: "Instructions générales",
    financialNotes: "Observations financières",
    parcelDescription: "Description du colis",
  };
  for (const [key, label] of Object.entries(labels))
    if (old[key] !== next[key])
      lines.push(`${label} : ${String(next[key] ?? "—")}`);
  if (JSON.stringify(old.pickup) !== JSON.stringify(next.pickup))
    lines.push("Informations de collecte mises à jour.");
  if (JSON.stringify(old.recipient) !== JSON.stringify(next.recipient))
    lines.push("Coordonnées du brouillon mises à jour.");
  return lines.length ? lines : ["Informations de la commande enregistrées."];
}
export const orderStatus: Record<string, string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmée",
  PREPARING: "En préparation",
  READY: "Prête",
  IN_DELIVERY: "En livraison",
  DELIVERED: "Livrée",
  FAILED: "Échec",
  CANCELLED: "Annulée",
  RETURNED: "Retournée",
};
export const orderEventLabel: Record<string, string> = {
  FINANCIAL_EXPECTED_CHANGED:"Montant attendu corrigé avec autorisation",
  DRAFT_CREATED: "Brouillon enregistré",
  SUBMITTED: "Commande soumise",
  UPDATED: "Commande modifiée",
  CANCELLED: "Commande annulée",
  DRAFT_ABANDONED: "Brouillon abandonné",
  STOCK_RESERVED: "Stock réservé",
  STOCK_RELEASED: "Réservation libérée",
  LEGACY: "Événement historique",
};
export const blankOrder = (
  companyId = "",
  shopId = "",
  agencyId = "",
): OrderContent => ({
  companyId,
  shopId,
  agencyId,
  type: "ONE_OFF",
  recipient: {
    name: "",
    email: "",
    phone: "",
    country: "",
    city: "",
    address: "",
  },
  saveRecipient: false,
  items: [],
  pickup: { address: "", contact: "", phone: "" },
  parcelDescription: "",
  collectionRequired: false,
  amountToCollect: "0",
  currency: "XAF",
});
export function orderForm(p: OrderDTO): OrderContent {
  return {
    companyId: p.companyId,
    shopId: p.shopId,
    agencyId: p.agencyId,
    type: p.type,
    recipient: p.recipientDetails ?? {
      name: p.recipientName,
      email: p.recipientEmail,
      phone: p.recipientPhone,
      country: p.recipientCountry,
      city: p.recipientCity,
      address: p.recipientAddress,
    },
    recipientId: p.recipientId ?? undefined,
    saveRecipient: false,
    items: p.orderItem_orderRecords.map((i) => ({
      productId: i.productId ?? undefined,
      name: i.name,
      sku: i.sku ?? undefined,
      description: i.description ?? undefined,
      instructions: i.instructions ?? undefined,
      quantity: i.quantity,
      declaredValue: i.declaredValue ?? undefined,
    })),
    pickup: p.pickup ?? undefined,
    parcelDescription: p.parcelDescription,
    collectionRequired: p.collectionRequired,
    amountToCollect: p.amountToCollect,
    currency: p.currency,
    financialNotes: p.financialNotes ?? undefined,
    notes: p.notes ?? undefined,
  };
}
export function orderValidation(x: OrderContent, step?: number) {
  const phone = (s: string) =>
    /^\+[1-9]\d{6,14}$/.test(s.replace(/[ ().-]/g, ""));
  if (
    (step === undefined || step === 0) &&
    (!x.companyId || !x.shopId || !x.agencyId)
  )
    return "Choisissez une agence de livraison, une boutique et une agence responsable autorisées.";
  const r = x.recipient;
  if (step === undefined || step === 1) {
    if (
      !r.name.trim() ||
      !r.country.trim() ||
      !r.city.trim() ||
      !r.address.trim()
    )
      return "Complétez le nom, le pays, la ville et l’adresse du destinataire.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))
      return "Indiquez une adresse e-mail valide.";
    if (!phone(r.phone))
      return "Saisissez un téléphone international, par exemple +32470123456.";
    if (r.desiredDeliveryAt && Number.isNaN(Date.parse(r.desiredDeliveryAt)))
      return "Vérifiez la date souhaitée de livraison.";
    if (
      (r.latitude !== undefined &&
        (!Number.isFinite(r.latitude) || Math.abs(r.latitude) > 90)) ||
      (r.longitude !== undefined &&
        (!Number.isFinite(r.longitude) || Math.abs(r.longitude) > 180))
    )
      return "Vérifiez les coordonnées GPS.";
  }
  if (step === undefined || step === 2) {
    if (
      !x.items.length ||
      x.items.length > 100 ||
      x.items.some(
        (i) =>
          !i.name.trim() ||
          !Number.isInteger(i.quantity) ||
          i.quantity < 1 ||
          i.quantity > 2147483647,
      )
    )
      return "Ajoutez de 1 à 100 articles avec désignation et quantité entière positive.";
    if (
      x.type === "FROM_STOCK" &&
      (x.items.some((i) => !i.productId) ||
        new Set(x.items.map((i) => i.productId)).size !== x.items.length)
    )
      return "Choisissez des produits distincts du catalogue pour une commande depuis stock.";
    if (
      x.items.some(
        (i) =>
          i.declaredValue && !/^\d{1,15}(\.\d{1,4})?$/.test(i.declaredValue),
      )
    )
      return "Vérifiez les valeurs déclarées (point décimal, quatre décimales au plus).";
    if (!x.parcelDescription.trim()) return "Décrivez le colis.";
    if (
      x.type === "ONE_OFF" &&
      (!x.pickup?.address.trim() ||
        !x.pickup.contact.trim() ||
        !phone(x.pickup.phone))
    )
      return "Complétez l’adresse et le contact de collecte avec un téléphone international.";
    if (
      !/^\d{1,15}(\.\d{1,4})?$/.test(x.amountToCollect) ||
      !/^[A-Z]{3}$/.test(x.currency) ||
      (x.collectionRequired && Number(x.amountToCollect) <= 0) ||
      (!x.collectionRequired && Number(x.amountToCollect) !== 0)
    )
      return "Montant positif si encaissement requis, zéro sinon. Devise de trois lettres et point décimal.";
  }
  return "";
}
export function orderCan(
  context: {
    scope: string;
    permissions: string[];
    subscriptionAccess?: { valid: boolean };
  },
  action: string,
) {
  return (
    context.permissions.includes(
      (context.scope === "SHOP" ? "shop.orders." : "orders.") + action,
    ) &&
    (!context.subscriptionAccess || context.subscriptionAccess.valid)
  );
}
