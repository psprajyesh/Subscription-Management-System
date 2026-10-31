import { Counter, RefreshToken, User } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import {
  generateRefreshToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
} from "../utils/tokens.js";
import { recordAudit } from "./audit.service.js";

function requestMeta(req) {
  return {
    ip: req?.ip ?? "",
    userAgent: req?.get?.("user-agent") ?? "",
  };
}

async function createRefreshToken(user, req) {
  const token = generateRefreshToken();
  const meta = requestMeta(req);

  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(token),
    expiresAt: refreshTokenExpiry(),
    tokenVersion: user.tokenVersion ?? 0,
    createdByIp: meta.ip,
    userAgent: meta.userAgent,
  });

  return token;
}

async function revokeToken(stored, reason) {
  stored.revokedAt = new Date();
  stored.revocationReason = reason;
  await stored.save();
}

async function revokeAllUserTokens(userId, reason) {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revocationReason: reason } },
  );
}

/**
 * Invalidates every session for a user. Used by password changes and by
 * account-security events (for example refresh-token reuse detection).
 */
export async function invalidateUserSessions(userId, reason = "token_version_changed") {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await revokeAllUserTokens(userId, reason);
}

async function handleRefreshTokenReuse(userId, req) {
  await invalidateUserSessions(userId, "reuse");

  await recordAudit({
    actor: userId,
    action: "auth.refresh_reuse_detected",
    entityType: "User",
    entityId: userId,
    req,
  });

  logger.warn(`Refresh token reuse detected; all sessions revoked for user ${userId}`);
}

/**
 * Creates the one allowed administrator. Registration is closed as soon as a
 * user exists, and a counter claim prevents two concurrent bootstrap requests
 * from both succeeding.
 */
export async function bootstrapAdmin({ name, email, password }, req) {
  const existingUsers = await User.estimatedDocumentCount();

  if (existingUsers > 0) {
    throw new AppError(
      "Registration is closed. An administrator already exists.",
      { statusCode: 403, code: "REGISTRATION_CLOSED" },
    );
  }

  const claim = await Counter.findOneAndUpdate(
    { _id: "bootstrap" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  if (claim.seq > 1) {
    throw new AppError(
      "Registration is closed. An administrator already exists.",
      { statusCode: 403, code: "REGISTRATION_CLOSED" },
    );
  }

  let user;

  try {
    user = new User({ name, email, role: "admin", status: "active" });
    await user.setPassword(password);
    await user.save();
  } catch (error) {
    // Release the bootstrap claim so a legitimate retry after a transient
    // database failure is still possible.
    await Counter.deleteOne({ _id: "bootstrap" }).catch(() => {});
    throw error;
  }

  await recordAudit({
    actor: user,
    action: "auth.bootstrap_admin",
    entityType: "User",
    entityId: user._id,
    diff: { role: "admin" },
    req,
  });

  return user;
}

export async function login({ email, password }, req) {
  const user = await User.findOne({ email }).select("+passwordHash +tokenVersion");
  const invalidCredentials = new AppError("Invalid email or password", {
    statusCode: 401,
    code: "INVALID_CREDENTIALS",
  });

  if (!user) {
    throw invalidCredentials;
  }

  const passwordMatches = await user.verifyPassword(password);

  if (!passwordMatches) {
    throw invalidCredentials;
  }

  if (user.status !== "active") {
    throw new AppError("Account is not active", {
      statusCode: 403,
      code: "ACCOUNT_INACTIVE",
    });
  }

  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user, req);

  await recordAudit({
    actor: user,
    action: "auth.login",
    entityType: "User",
    entityId: user._id,
    req,
  });

  return { user, tokens: { accessToken, refreshToken } };
}

export async function refreshSession(refreshToken, req) {
  if (!refreshToken) {
    throw new AppError("Refresh token is missing", {
      statusCode: 401,
      code: "REFRESH_TOKEN_MISSING",
    });
  }

  const stored = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });

  if (!stored) {
    throw new AppError("Session is invalid or has expired", {
      statusCode: 401,
      code: "INVALID_REFRESH_TOKEN",
    });
  }

  const now = new Date();

  if (stored.revokedAt) {
    if (stored.revocationReason === "rotated") {
      await handleRefreshTokenReuse(stored.user, req);
      throw new AppError(
        "Refresh token reuse detected. All sessions have been revoked.",
        { statusCode: 401, code: "REFRESH_TOKEN_REUSED" },
      );
    }

    throw new AppError("Session has been revoked", {
      statusCode: 401,
      code: "SESSION_REVOKED",
    });
  }

  if (stored.expiresAt <= now) {
    await revokeToken(stored, "expired");
    throw new AppError("Session has expired", {
      statusCode: 401,
      code: "REFRESH_TOKEN_EXPIRED",
    });
  }

  const user = await User.findById(stored.user).select("+tokenVersion");

  if (!user) {
    await revokeToken(stored, "account_removed");
    throw new AppError("Session is invalid or has expired", {
      statusCode: 401,
      code: "INVALID_REFRESH_TOKEN",
    });
  }

  if (user.status !== "active") {
    await revokeToken(stored, "account_inactive");
    throw new AppError("Account is not active", {
      statusCode: 403,
      code: "ACCOUNT_INACTIVE",
    });
  }

  if ((stored.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    await revokeToken(stored, "token_version_changed");
    throw new AppError("Session has been revoked", {
      statusCode: 401,
      code: "SESSION_REVOKED",
    });
  }

  const nextRefreshToken = generateRefreshToken();
  const nextHash = hashToken(nextRefreshToken);
  const meta = requestMeta(req);

  stored.revokedAt = now;
  stored.revocationReason = "rotated";
  stored.replacedByHash = nextHash;
  await stored.save();

  await RefreshToken.create({
    user: user._id,
    tokenHash: nextHash,
    expiresAt: refreshTokenExpiry(),
    tokenVersion: user.tokenVersion ?? 0,
    createdByIp: meta.ip,
    userAgent: meta.userAgent,
  });

  await recordAudit({
    actor: user,
    action: "auth.refresh",
    entityType: "User",
    entityId: user._id,
    req,
  });

  return {
    user,
    tokens: {
      accessToken: signAccessToken(user),
      refreshToken: nextRefreshToken,
    },
  };
}

export async function logout(refreshToken, req) {
  if (!refreshToken) {
    return;
  }

  const stored = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });

  if (!stored || stored.revokedAt) {
    return;
  }

  await revokeToken(stored, "logout");

  await recordAudit({
    actor: stored.user,
    action: "auth.logout",
    entityType: "User",
    entityId: stored.user,
    req,
  });
}

export async function changePassword(userId, { currentPassword, newPassword }, req) {
  const user = await User.findById(userId).select("+passwordHash +tokenVersion");

  if (!user) {
    throw AppError.unauthorized("Account no longer exists");
  }

  const currentPasswordMatches = await user.verifyPassword(currentPassword);

  if (!currentPasswordMatches) {
    throw new AppError("Current password is incorrect", {
      statusCode: 401,
      code: "INVALID_CURRENT_PASSWORD",
    });
  }

  if (currentPassword === newPassword) {
    throw new AppError("New password must be different from the current password", {
      statusCode: 422,
      code: "PASSWORD_UNCHANGED",
    });
  }

  await user.setPassword(newPassword);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  await revokeAllUserTokens(user._id, "password_change");

  await recordAudit({
    actor: user,
    action: "auth.password_changed",
    entityType: "User",
    entityId: user._id,
    req,
  });

  return user;
}
