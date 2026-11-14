import "dotenv/config";
import {getDeliveryService} from "../modules/deliveries/routes.js";
import {DeliveryNotifications} from "../modules/deliveries/notifications.js";
import {subscriptionMailer} from "../modules/auth/smtp.js";
import {disconnectDatabase} from "../database/client.js";
try{const limit=Number(process.env.DELIVERY_NOTIFICATION_BATCH??100);if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error("Invalid batch size");console.log(await new DeliveryNotifications(getDeliveryService()).run(subscriptionMailer(),limit));}catch(e){console.error(e instanceof Error?e.name:"DeliveryNotificationJobError");process.exitCode=1;}finally{await disconnectDatabase();}
