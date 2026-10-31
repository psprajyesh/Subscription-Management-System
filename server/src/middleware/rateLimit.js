import rateLimit from "express-rate-limit";
import { isTest } from "../config/env.js";

/**
 * Global API limiter. Authentication endpoints add their own stricter limiter.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." },
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => isTest,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many authentication attempts. Please try again later." },
  },
});

export default apiLimiter;
