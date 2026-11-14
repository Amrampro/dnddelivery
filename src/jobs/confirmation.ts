import "dotenv/config";
import { getDatabase, disconnectDatabase } from "../database/client.js";
import { OrderService } from "../modules/orders/service.js";
import { OrderNotifications } from "../modules/orders/notifications.js";
import { DeliveryService } from "../modules/deliveries/service.js";
import { DeliveryNotifications } from "../modules/deliveries/notifications.js";
import {
  ConfirmationNotifications,
  expoPush,
} from "../modules/confirmation/internal-notifications.js";
import { subscriptionMailer } from "../modules/auth/smtp.js";
try {
  const limit = Number(process.env.DELIVERY_NOTIFICATION_BATCH ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw Error("Invalid batch size");
  const db = getDatabase(),
    mailer = subscriptionMailer(),
    push =
      process.env.DELIVERY_PUSH_ENABLED === "true" ? expoPush(db) : undefined;
  console.log({
    orders: await new OrderNotifications(new OrderService(db)).run(
      mailer,
      limit,
    ),
    deliveries: await new DeliveryNotifications(new DeliveryService(db)).run(
      {
        ...mailer,
        ...(push
          ? {
              push: (
                userId: string,
                payload: { deliveryId: string },
                key: string,
              ) => push(userId, payload.deliveryId, key),
            }
          : {}),
      },
      limit,
    ),
    confirmations: await new ConfirmationNotifications(db).run(
      { ...mailer, ...(push ? { push } : {}) },
      limit,
    ),
  });
} catch (e) {
  console.error(e instanceof Error ? e.name : "DeliveryCommunicationError");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
