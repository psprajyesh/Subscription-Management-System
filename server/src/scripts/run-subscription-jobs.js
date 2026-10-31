import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/db.js";
import {
  processExpirations,
  processRenewals,
  processSubscriptionJobs,
} from "../jobs/subscriptionJobs.js";

function argument(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

async function run() {
  const job = argument("job") || "all";
  const now = argument("now") ? new Date(argument("now")) : new Date();
  const limit = Number(argument("limit") || 100);

  if (Number.isNaN(now.getTime())) {
    throw new Error("--now must be a valid ISO date");
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer");
  }

  if (!["all", "renewals", "expirations"].includes(job)) {
    throw new Error("--job must be one of: all, renewals, expirations");
  }

  await connectDB();

  let result;

  if (job === "renewals") {
    result = await processRenewals({ now, limit });
  } else if (job === "expirations") {
    result = await processExpirations({ now, limit });
  } else {
    result = await processSubscriptionJobs({ now, limit });
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

run()
  .catch((error) => {
    process.stderr.write(`Subscription job runner failed: ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await disconnectDB();
    }
  });
