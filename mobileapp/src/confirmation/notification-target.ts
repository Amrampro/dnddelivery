import type { Workspace } from "../auth/types";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export type NotificationTarget =
  | { kind: "delivery"; id: string }
  | { kind: "financial"; companyId: string };
export function notificationTarget(
  value: unknown,
): NotificationTarget | undefined {
  const id = notificationDelivery(value);
  if (id) return { kind: "delivery", id };
  if (!value || typeof value !== "object") return;
  const data = value as { module?: unknown; companyId?: unknown };
  if (
    data.module === "remises" &&
    typeof data.companyId === "string" &&
    uuid.test(data.companyId)
  )
    return { kind: "financial", companyId: data.companyId };
}
export function notificationModule(
  target: NotificationTarget,
  context: Workspace,
): string | undefined {
  if (target.kind === "delivery") return deliveryModule(context);
  if (
    context.companyId === target.companyId &&
    context.permissions.some((p) =>
      ["remittances.read", "remittances.self.read"].includes(p),
    )
  )
    return "remises";
}
export function notificationDelivery(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return;
  const id = (value as { deliveryId?: unknown }).deliveryId;
  return typeof id === "string" && uuid.test(id) ? id : undefined;
}
export function deliveryModule(context: Workspace): string | undefined {
  if (context.permissions.includes("deliveries.supervise.read"))
    return "livraisons";
  if (
    ["COMPANY", "AGENCY"].includes(context.scope) &&
    context.permissions.includes("deliveries.self.read")
  )
    return "courses";
  if (
    context.scope === "SHOP" &&
    context.permissions.includes("shop.deliveries.read")
  )
    return "suivi";
}
