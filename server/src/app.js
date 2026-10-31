import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env, isTest, isProduction } from "./config/env.js";
import routes from "./routes/index.js";
import { createApiLimiter, createAuthLimiter } from "./middleware/rateLimit.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

/**
 * Builds the Express application without starting a listener.
 * Keeping this separate makes the app testable with supertest.
 */
export function createApp({ rateLimitEnabled = !isTest } = {}) {
  const app = express();

  app.disable("x-powered-by");

  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  if (!isTest) {
    app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  }

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser(env.COOKIE_SECRET));

  app.use("/api", createApiLimiter({ enabled: rateLimitEnabled }));
  app.use("/api/auth", createAuthLimiter({ enabled: rateLimitEnabled }));
  app.use("/api", routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
