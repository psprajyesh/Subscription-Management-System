import { AppError } from "../utils/AppError.js";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Validates route parameters before Mongoose casting so clients always receive
 * a consistent INVALID_IDENTIFIER error rather than a driver-level cast error.
 */
export function validateObjectIdParam(...paramNames) {
  return function validateObjectIdParams(req, _res, next) {
    for (const name of paramNames) {
      const value = req.params?.[name];

      if (typeof value !== "string" || !OBJECT_ID_PATTERN.test(value)) {
        return next(
          new AppError(`Invalid value for "${name}"`, {
            statusCode: 400,
            code: "INVALID_IDENTIFIER",
          }),
        );
      }
    }

    return next();
  };
}

export default validateObjectIdParam;
