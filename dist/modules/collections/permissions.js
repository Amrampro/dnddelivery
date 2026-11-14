const supervise = [
    "collections.read",
    "financial.supervise.read",
    "remittances.read",
    "remittances.confirm",
    "financial.discrepancies.manage",
    "financial.corrections.request",
    "collections.expected.request",
    "financial.history.read",
];
export const financialGrants = {
    company_admin: [
        ...supervise,
        "financial.corrections.approve",
        "collections.expected.exception",
    ],
    agency_manager: supervise,
    courier: [
        "collections.self.read",
        "collections.declare",
        "remittances.self.read",
        "remittances.declare",
        "financial.corrections.self.request",
        "financial.history.self.read",
    ],
    shop_owner: ["shop.collections.read"],
    shop_manager: ["shop.collections.read"],
    shop_employee: ["shop.collections.read"],
};
