import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  bootstrapAdmin,
  changePassword as changePasswordService,
  login as loginService,
  logout as logoutService,
  refreshSession,
} from "../services/auth.service.js";
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from "../utils/cookies.js";
import { sendCreated, sendSuccess } from "../utils/response.js";

/**
 * POST /api/auth/register
 * Public bootstrap endpoint. It only works while no users exist, which prevents
 * public administrator registration after the workspace is initialized.
 */
export const register = asyncHandler(async (req, res) => {
  const user = await bootstrapAdmin(req.validated.body, req);
  return sendCreated(res, { user: user.toJSON() });
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { user, tokens } = await loginService(req.validated.body, req);
  setAuthCookies(res, tokens);
  return sendSuccess(res, { user: user.toJSON() });
});

/** POST /api/auth/refresh — rotates the refresh token and issues a new access token. */
export const refresh = asyncHandler(async (req, res) => {
  try {
    const { user, tokens } = await refreshSession(req.cookies?.[REFRESH_COOKIE], req);
    setAuthCookies(res, tokens);
    return sendSuccess(res, { user: user.toJSON() });
  } catch (error) {
    clearAuthCookies(res);
    throw error;
  }
});

/** POST /api/auth/logout — revokes the presented refresh token and clears cookies. */
export const logout = asyncHandler(async (req, res) => {
  await logoutService(req.cookies?.[REFRESH_COOKIE], req);
  clearAuthCookies(res);
  return sendSuccess(res, { message: "Logged out" });
});

/** GET /api/auth/me */
export const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, { user: req.user.toJSON() });
});

/** PATCH /api/auth/password — verifies the current password and revokes all sessions. */
export const changePassword = asyncHandler(async (req, res) => {
  await changePasswordService(req.user._id, req.validated.body, req);
  clearAuthCookies(res);
  return sendSuccess(res, {
    message: "Password updated. Please sign in again.",
  });
});
