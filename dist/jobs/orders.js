import "dotenv/config";
import { getOrderService } from "../modules/orders/routes.js";
import { OrderNotifications } from "../modules/orders/notifications.js";
import { subscriptionMailer } from "../modules/auth/smtp.js";
import { disconnectDatabase } from "../database/client.js";
try {
    const limit = Number(process.env.ORDER_NOTIFICATION_BATCH ?? 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
        throw new Error("Invalid batch size");
    console.log(await new OrderNotifications(getOrderService()).run(subscriptionMailer(), limit));
}
catch (e) {
    console.error(e instanceof Error ? e.name : "OrderNotificationJobError");
    process.exitCode = 1;
}
finally {
    await disconnectDatabase();
}
