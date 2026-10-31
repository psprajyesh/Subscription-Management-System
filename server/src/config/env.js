import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, "../../.env"), quiet: true });

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const booleanFromStringDefaultTrue = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/brightloop"),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  COOKIE_SECURE: booleanFromString,
  COOKIE_SECRET: z.string().min(16, "COOKIE_SECRET must be at least 16 characters"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),
  INVOICE_PREFIX: z.string().min(1).default("INV"),
  INVOICE_DUE_DAYS: z.coerce.number().int().min(0).default(7),
  SUBSCRIPTION_JOBS_ENABLED: booleanFromStringDefaultTrue,
  SUBSCRIPTION_JOBS_CRON: z.string().min(1).default("0 * * * *"),
  SUBSCRIPTION_JOB_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  RAZORPAY_KEY_ID: z.string().optional().default(""),
  RAZORPAY_KEY_SECRET: z.string().optional().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(""),
  SEED_ADMIN_NAME: z.string().optional().default("Alex Davis"),
  SEED_ADMIN_EMAIL: z.string().email().optional().default("admin@brightloop.test"),
  SEED_ADMIN_PASSWORD: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  console.error("Create server/.env from server/.env.example and fill in the missing values.\n");
  process.exit(1);
}

export const env = Object.freeze(parsed.data);

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
