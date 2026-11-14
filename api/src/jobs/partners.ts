import "dotenv/config";
import {getPartnerService} from "../modules/partners/routes.js";
import {PartnerNotifications} from "../modules/partners/notifications.js";
import {subscriptionMailer} from "../modules/auth/smtp.js";
import {disconnectDatabase} from "../database/client.js";
try {
 const raw=process.env.PARTNER_NOTIFICATION_BATCH ?? '100';
 const limit=Number(raw);
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('Invalid batch size');
 console.log(await new PartnerNotifications(getPartnerService()).run(subscriptionMailer(),limit));
} catch(e) {
 console.error(e instanceof Error?e.name:'PartnerNotificationJobError');
 process.exitCode=1;
} finally {await disconnectDatabase();}
