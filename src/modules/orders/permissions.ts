export const orderGrants: Record<string, readonly string[]> = {
  company_admin: [
    "orders.read",
    "orders.create",
    "orders.edit",
    "orders.cancel",
  ],
  agency_manager: [
    "orders.read",
    "orders.create",
    "orders.edit",
    "orders.cancel",
  ],
  agency_employee: ["orders.read", "orders.create", "orders.edit"],
  shop_owner: [
    "orders.read",
    "shop.orders.read",
    "shop.orders.create",
    "shop.orders.edit",
    "shop.orders.cancel",
  ],
  shop_manager: [
    "orders.read",
    "shop.orders.read",
    "shop.orders.create",
    "shop.orders.edit",
    "shop.orders.cancel",
  ],
  shop_employee: [
    "orders.read",
    "shop.orders.read",
    "shop.orders.create",
    "shop.orders.edit",
  ],
};
