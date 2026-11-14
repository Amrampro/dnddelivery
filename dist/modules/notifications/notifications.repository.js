import { assertTenantContext, } from "../authorization/tenant-access.js";
export function notificationsRepository(db) {
    return {
        listOwn(context) {
            assertTenantContext(context, "notifications.read");
            return db.notification.findMany({
                where: {
                    companyId: context.companyId,
                    recipientUserId: context.userId,
                },
                select: {
                    id: true,
                    channel: true,
                    sourceEvent: true,
                    template: true,
                    status: true,
                    createdAt: true,
                    sentAt: true,
                },
                take: 100,
                orderBy: { createdAt: "desc" },
            });
        },
    };
}
