import mongoose from "mongoose";
import { isProduction } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { sendError } from "../utils/response.js";

function normalizeError(err) {
  if (err?.name === "ZodError") {
    return {
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: err.issues?.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
    };
  }

  if (err?.name === "ValidationError" && err instanceof mongoose.Error) {
    return {
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: Object.values(err.errors).map((item) => ({
        field: item.path,
        message: item.message,
      })),
    };
  }

  if (err?.name === "CastError" && err instanceof mongoose.Error) {
    return {
      status: 400,
      code: "INVALID_IDENTIFIER",
      message: `Invalid value for "${err.path}"`,
    };
  }

  if (err?.code === 11000) {
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    return {
      status: 409,
      code: "DUPLICATE_RESOURCE",
      message: fields.length
        ? `A record with the same ${fields.join(", ")} already exists`
        : "A record with the same unique values already exists",
      details: fields.length ? { fields } : undefined,
    };
  }

  if (err?.type === "entity.parse.failed") {
    return { status: 400, code: "INVALID_JSON", message: "Request body contains invalid JSON" };
  }

  if (err?.name === "TokenExpiredError") {
    return { status: 401, code: "TOKEN_EXPIRED", message: "Session has expired" };
  }

  if (err?.name === "JsonWebTokenError") {
    return { status: 401, code: "INVALID_TOKEN", message: "Session is invalid" };
  }

  if (err?.name === "NotBeforeError") {
    return { status: 401, code: "INVALID_TOKEN", message: "Session is not active yet" };
  }

  if (err?.isOperational) {
    return {
      status: err.statusCode || 500,
      code: err.code || "INTERNAL_ERROR",
      message: err.message,
      details: err.details,
    };
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Something went wrong",
  };
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const normalized = normalizeError(err);

  if (normalized.status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} — ${err?.stack || err}`);
  } else if (!isProduction) {
    logger.warn(`${req.method} ${req.originalUrl} — ${normalized.status} ${normalized.message}`);
  }

  const payload = { ...normalized };
  if (isProduction && payload.status >= 500) {
    delete payload.details;
  }

  return sendError(res, payload);
}

export default errorHandler;
