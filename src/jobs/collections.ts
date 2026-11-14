import "dotenv/config";
import { getFinancialService } from "../modules/collections/routes.js";
import { FinancialNotifications } from "../modules/collections/notifications.js";
import { subscriptionMailer } from "../modules/auth/smtp.js";
import { disconnectDatabase } from "../database/client.js";
import { expoNotification } from "../modules/confirmation/internal-notifications.js";
try {
  const limit = Number(process.env.FINANCIAL_NOTIFICATION_BATCH ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw Error("Invalid batch size");
  const service = getFinancialService(),
    push =
      process.env.DELIVERY_PUSH_ENABLED === "true"
        ? expoNotification(service.db)
        : undefined;
  console.log(
    await new FinancialNotifications(service).run(
      {
        ...subscriptionMailer(),
        ...(push
          ? {
              push: (
                userId: string,
                payload: { companyId?: string },
                key: string,
              ) =>
                push(userId, {
                  module: "remises",
                  companyId: payload.companyId ?? "",
                  notificationId: key,
                }),
            }
          : {}),
      },
      limit,
    ),
  );
} catch (e) {
  console.error(e instanceof Error ? e.name : "FinancialNotificationJobError");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
