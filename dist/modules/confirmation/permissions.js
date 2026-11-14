export const confirmationGrants = {
    company_admin: [
        "delivery.proofs.read",
        "delivery.otp.manage",
        "delivery.exceptions.approve",
        "tracking.manage",
        "delivery.notifications.read",
    ],
    agency_manager: [
        "delivery.proofs.read",
        "delivery.otp.manage",
        "delivery.exceptions.approve",
        "tracking.manage",
        "delivery.notifications.read",
    ],
    courier: [
        "delivery.proofs.self.read",
        "delivery.otp.verify",
        "delivery.proofs.upload",
        "delivery.complete",
        "delivery.exceptions.request",
    ],
    shop_owner: ["shop.delivery.proofs.read", "shop.delivery.notifications.read"],
    shop_manager: [
        "shop.delivery.proofs.read",
        "shop.delivery.notifications.read",
    ],
    shop_employee: [
        "shop.delivery.proofs.read",
        "shop.delivery.notifications.read",
    ],
};
