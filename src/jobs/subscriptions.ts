import { reportJobResult, reportJobFailure } from "../utils/job-log.js";
import "dotenv/config";
import { getSubscriptionService } from "../modules/subscriptions/routes.js";
import { SubscriptionJobs } from "../modules/subscriptions/jobs.js";
import { subscriptionMailer } from "../modules/auth/smtp.js";
import { disconnectDatabase } from "../database/client.js";
const command = process.argv[2];
try {
  const jobs = new SubscriptionJobs(getSubscriptionService());
  if (command === "expire") await reportJobResult(await jobs.expire());
  else if (command === "reminders") await reportJobResult(await jobs.reminders());
  else if (command === "notifications")
    await reportJobResult(await jobs.notifications(subscriptionMailer()));
  else throw new Error("Expected expire, reminders or notifications");
} catch (e) {
  await reportJobFailure(e);
  console.error(e instanceof Error ? e.name : "JobError");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
