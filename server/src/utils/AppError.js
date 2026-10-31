/**
 * Operational error with an HTTP status and a stable machine-readable code.
 * Anything that is not an AppError is treated as an unexpected failure.
 */
export class AppError extends Error {
  constructor(message, { statusCode = 500, code = "INTERNAL_ERROR", details = undefined } = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message = "Bad request", details) {
    return new AppError(message, { statusCode: 400, code: "BAD_REQUEST", details });
  }

  static unauthorized(message = "Authentication required") {
    return new AppError(message, { statusCode: 401, code: "UNAUTHORIZED" });
  }

  static forbidden(message = "You do not have permission to perform this action") {
    return new AppError(message, { statusCode: 403, code: "FORBIDDEN" });
  }

  static notFound(message = "Resource not found") {
    return new AppError(message, { statusCode: 404, code: "NOT_FOUND" });
  }

  static conflict(message = "Resource already exists", details) {
    return new AppError(message, { statusCode: 409, code: "CONFLICT", details });
  }

  static unprocessable(message = "Validation failed", details) {
    return new AppError(message, { statusCode: 422, code: "VALIDATION_ERROR", details });
  }
}

export default AppError;
