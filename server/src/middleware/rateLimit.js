import rateLimit from "express-rate-limit";

const TOO_MANY = {
  success: false,
  error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." },
};

const TOO_MANY_AUTH = {
  success: false,
  error: {
    code: "RATE_LIMITED",
    message: "Too many authentication attempts. Please try again later.",
  },
};

/**
 * Factories keep limiters testable: tests can build an app with rate limiting
 * enabled while the default test app disables it.
 */
export function createApiLimiter({ enabled = true } = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => !enabled,
    message: TOO_MANY,
  });
}

/** 10 failed authentication attempts per 15 minutes. */
export function createAuthLimiter({ enabled = true } = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: () => !enabled,
    message: TOO_MANY_AUTH,
  });
}

export default createApiLimiter;
