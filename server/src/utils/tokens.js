import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { parseDurationToMs } from "./duration.js";

const TOKEN_ISSUER = "brightloop-api";
const TOKEN_AUDIENCE = "brightloop-web";

/**
 * Short-lived access JWT. Includes the user's token version so password
 * changes and security events can invalidate existing sessions.
 */
export function signAccessToken(user, options = {}) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
      type: "access",
    },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      expiresIn: env.ACCESS_TOKEN_TTL,
      ...options,
    },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });
}

/**
 * Refresh tokens are opaque random values, not JWTs. Only a SHA-256 hash is
 * stored, so a database leak does not expose usable tokens.
 */
export function generateRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiry() {
  return new Date(Date.now() + parseDurationToMs(env.REFRESH_TOKEN_TTL));
}
