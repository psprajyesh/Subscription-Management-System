import { User } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import { verifyAccessToken } from "../utils/tokens.js";
import { ACCESS_COOKIE } from "../utils/cookies.js";

/**
 * Requires a valid, non-revoked access token in the HTTP-only cookie and loads
 * the current user onto `req.user`. Token version mismatches invalidate sessions
 * after password changes or security events.
 */
export async function protect(req, _res, next) {
  try {
    const token = req.cookies?.[ACCESS_COOKIE];

    if (!token) {
      throw AppError.unauthorized("Authentication required");
    }

    const payload = verifyAccessToken(token);

    if (payload.type !== "access" || !payload.sub) {
      throw AppError.unauthorized("Invalid session token");
    }

    const user = await User.findById(payload.sub).select("+tokenVersion");

    if (!user) {
      throw AppError.unauthorized("Account no longer exists");
    }

    if (user.status !== "active") {
      throw AppError.forbidden("Account is not active");
    }

    if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new AppError("Session has been revoked", {
        statusCode: 401,
        code: "SESSION_REVOKED",
      });
    }

    req.user = user;
    req.auth = payload;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Role-based authorization. Must run after `protect`.
 */
export function authorize(...roles) {
  return function authorizeRole(req, _res, next) {
    if (!req.user) {
      return next(AppError.unauthorized("Authentication required"));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        AppError.forbidden("You do not have permission to perform this action"),
      );
    }

    return next();
  };
}

export const requireAdmin = authorize("admin");
export const requireStaff = authorize("admin", "staff");

export default protect;
