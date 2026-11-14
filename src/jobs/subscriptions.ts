import "dotenv/config";
import { getSubscriptionService } from "../modules/subscriptions/routes.js";
import { SubscriptionJobs } from "../modules/subscriptions/jobs.js";
import { subscriptionMailer } from "../modules/auth/smtp.js";
import { disconnectDatabase } from "../database/client.js";
const command = process.argv[2];
try {
  const jobs = new SubscriptionJobs(getSubscriptionService());
  if (command === "expire") console.log(await jobs.expire());
  else if (command === "reminders") console.log(await jobs.reminders());
  else if (command === "notifications")
    console.log(await jobs.notifications(subscriptionMailer()));
  else throw new Error("Expected expire, reminders or notifications");
} catch (e) {
  console.error(e instanceof Error ? e.name : "JobError");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
