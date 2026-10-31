import cron from "node-cron";
import { env, isTest } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { processSubscriptionJobs } from "./subscriptionJobs.js";

let scheduledTask = null;
let running = false;

export function startSubscriptionJobScheduler() {
  if (isTest || !env.SUBSCRIPTION_JOBS_ENABLED) {
    return null;
  }

  if (!cron.validate(env.SUBSCRIPTION_JOBS_CRON)) {
    throw new Error(`Invalid SUBSCRIPTION_JOBS_CRON expression: ${env.SUBSCRIPTION_JOBS_CRON}`);
  }

  scheduledTask = cron.schedule(
    env.SUBSCRIPTION_JOBS_CRON,
    async () => {
      if (running) {
        logger.warn("Subscription job run skipped because the previous run is still active");
        return;
      }

      running = true;

      try {
        const result = await processSubscriptionJobs({
          limit: env.SUBSCRIPTION_JOB_BATCH_SIZE,
        });
        logger.info(
          `Subscription jobs completed: renewals=${result.renewals.renewed}, ` +
            `expirations=${result.expirations.expired}, ` +
            `failed=${result.renewals.failed + result.expirations.failed}`,
        );
      } catch (error) {
        logger.error("Subscription job run failed", error);
      } finally {
        running = false;
      }
    },
    { timezone: "UTC", noOverlap: true },
  );

  logger.info(`Subscription job scheduler started (${env.SUBSCRIPTION_JOBS_CRON} UTC)`);
  return scheduledTask;
}

export function stopSubscriptionJobScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

export default startSubscriptionJobScheduler;
