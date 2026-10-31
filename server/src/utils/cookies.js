import { env, isProduction } from "../config/env.js";
import { parseDurationToMs } from "./duration.js";

export const ACCESS_COOKIE = "bl_access";
export const REFRESH_COOKIE = "bl_refresh";
export const REFRESH_COOKIE_PATH = "/api/auth";

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProduction,
    sameSite: isProduction ? "strict" : "lax",
  };
}

export function accessCookieOptions() {
  return {
    ...baseCookieOptions(),
    path: "/",
    maxAge: parseDurationToMs(env.ACCESS_TOKEN_TTL),
  };
}

export function refreshCookieOptions() {
  return {
    ...baseCookieOptions(),
    path: REFRESH_COOKIE_PATH,
    maxAge: parseDurationToMs(env.REFRESH_TOKEN_TTL),
  };
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions());
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, {
    ...baseCookieOptions(),
    path: "/",
  });
  res.clearCookie(REFRESH_COOKIE, {
    ...baseCookieOptions(),
    path: REFRESH_COOKIE_PATH,
  });
}
