import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { AuditLog, Counter, RefreshToken, User } from "../src/models/index.js";
import { protect, authorize } from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../src/utils/cookies.js";
import { generateRefreshToken, hashToken, signAccessToken } from "../src/utils/tokens.js";

const app = createApp();
const PASSWORD = "StrongPass123!";
const NEW_PASSWORD = "EvenStronger456!";

async function createUser({
  role = "admin",
  email = "admin@brightloop.test",
  status = "active",
  name = "Test Admin",
  password = PASSWORD,
} = {}) {
  const user = new User({ name, email, role, status });
  await user.setPassword(password);
  await user.save();
  return user;
}

function cookiesFrom(response) {
  return response.headers["set-cookie"] ?? [];
}

function cookieFor(response, name) {
  const raw = cookiesFrom(response).find((cookie) => cookie.startsWith(`${name}=`));
  return raw ? raw.split(";")[0] : null;
}

function login(email, password = PASSWORD) {
  return request(app).post("/api/auth/login").send({ email, password });
}

beforeEach(async () => {
  await Promise.all([
    RefreshToken.deleteMany({}),
    AuditLog.deleteMany({}),
    User.deleteMany({}),
    Counter.deleteOne({ _id: "bootstrap" }),
  ]);
});

describe("admin bootstrap registration", () => {
  it("creates the first administrator and then closes registration", async () => {
    const first = await request(app).post("/api/auth/register").send({
      name: "Bootstrap Admin",
      email: "bootstrap@brightloop.test",
      password: PASSWORD,
    });

    expect(first.status).toBe(201);
    expect(first.body.success).toBe(true);
    expect(first.body.data.user.role).toBe("admin");
    expect(first.body.data.user.email).toBe("bootstrap@brightloop.test");
    expect(first.body.data.user.passwordHash).toBeUndefined();

    const second = await request(app).post("/api/auth/register").send({
      name: "Second Admin",
      email: "second@brightloop.test",
      password: PASSWORD,
    });

    expect(second.status).toBe(403);
    expect(second.body.error.code).toBe("REGISTRATION_CLOSED");
  });

  it("validates the bootstrap payload", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "A",
      email: "not-an-email",
      password: "short",
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("prevents public registration once a user exists", async () => {
    await createUser({ email: "existing@brightloop.test" });

    const response = await request(app).post("/api/auth/register").send({
      name: "Another Admin",
      email: "another@brightloop.test",
      password: PASSWORD,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("REGISTRATION_CLOSED");
  });
});

describe("login", () => {
  it("logs in with valid credentials and sets secure HTTP-only cookies", async () => {
    const user = await createUser({ email: "login@brightloop.test" });

    const response = await login("LOGIN@brightloop.test");

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(user.email);
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");

    const accessCookie = cookiesFrom(response).find((cookie) =>
      cookie.startsWith(`${ACCESS_COOKIE}=`),
    );
    const refreshCookie = cookiesFrom(response).find((cookie) =>
      cookie.startsWith(`${REFRESH_COOKIE}=`),
    );

    expect(accessCookie).toContain("HttpOnly");
    expect(accessCookie).toContain("Path=/");
    expect(accessCookie).toContain("SameSite=Lax");

    expect(refreshCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("Path=/api/auth");
    expect(refreshCookie).toContain("SameSite=Lax");
    expect(refreshCookie).not.toContain("Secure");
  });

  it("rejects an unknown email and a wrong password with the same message", async () => {
    await createUser({ email: "known@brightloop.test" });

    const unknown = await login("nobody@brightloop.test");
    const wrong = await login("known@brightloop.test", "WrongPass123!");

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it("rejects inactive accounts", async () => {
    await createUser({ email: "invited@brightloop.test", status: "invited" });

    const response = await login("invited@brightloop.test");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCOUNT_INACTIVE");
  });
});

describe("protected routes and access tokens", () => {
  it("returns the current user for a valid access cookie", async () => {
    const user = await createUser({ email: "me@brightloop.test" });
    const agent = request.agent(app);

    await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: PASSWORD })
      .expect(200);

    const response = await agent.get("/api/auth/me");

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(user.email);
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.user.tokenVersion).toBeUndefined();
  });

  it("denies protected routes without a token", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects invalid access tokens", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", [`${ACCESS_COOKIE}=not-a-valid-jwt`]);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_TOKEN");
  });

  it("rejects expired access tokens", async () => {
    const user = await createUser({ email: "expired-access@brightloop.test" });
    const expiredToken = signAccessToken(user, { expiresIn: -1 });

    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", [`${ACCESS_COOKIE}=${expiredToken}`]);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("TOKEN_EXPIRED");
  });
});

describe("refresh token lifecycle", () => {
  it("logs out and revokes the refresh token", async () => {
    const user = await createUser({ email: "logout@brightloop.test" });
    const loginResponse = await login(user.email);
    const refreshCookie = cookieFor(loginResponse, REFRESH_COOKIE);

    const logoutResponse = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", refreshCookie);

    expect(logoutResponse.status).toBe(200);

    const replay = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("SESSION_REVOKED");

    const stored = await RefreshToken.findOne({ user: user._id });
    expect(stored.revocationReason).toBe("logout");
    expect(stored.revokedAt).toBeInstanceOf(Date);
  });

  it("rotates refresh tokens and accepts the replacement", async () => {
    const user = await createUser({ email: "rotate@brightloop.test" });
    const loginResponse = await login(user.email);
    const firstRefreshCookie = cookieFor(loginResponse, REFRESH_COOKIE);

    const rotated = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", firstRefreshCookie);

    expect(rotated.status).toBe(200);
    const secondRefreshCookie = cookieFor(rotated, REFRESH_COOKIE);

    expect(secondRefreshCookie).toBeTruthy();
    expect(secondRefreshCookie).not.toBe(firstRefreshCookie);
    expect(rotated.body.data.accessToken).toBeUndefined();

    const accepted = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", secondRefreshCookie);

    expect(accepted.status).toBe(200);
    expect(accepted.body.data.user.email).toBe(user.email);
  });

  it("detects reuse of a rotated refresh token and revokes every session", async () => {
    const user = await createUser({ email: "reuse@brightloop.test" });
    const loginResponse = await login(user.email);
    const firstRefreshCookie = cookieFor(loginResponse, REFRESH_COOKIE);

    const rotated = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", firstRefreshCookie);
    const secondRefreshCookie = cookieFor(rotated, REFRESH_COOKIE);

    const reuse = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", firstRefreshCookie);

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("REFRESH_TOKEN_REUSED");

    const replacementAttempt = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", secondRefreshCookie);

    expect(replacementAttempt.status).toBe(401);
    expect(replacementAttempt.body.error.code).toBe("SESSION_REVOKED");

    const updatedUser = await User.findById(user._id).select("+tokenVersion");
    expect(updatedUser.tokenVersion).toBe(1);
  });

  it("handles missing, invalid and expired refresh tokens", async () => {
    const missing = await request(app).post("/api/auth/refresh");
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("REFRESH_TOKEN_MISSING");

    const invalid = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`${REFRESH_COOKIE}=not-a-real-token`]);
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("INVALID_REFRESH_TOKEN");

    const user = await createUser({ email: "expired-refresh@brightloop.test" });
    const token = generateRefreshToken();

    await RefreshToken.create({
      user: user._id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 25),
      tokenVersion: user.tokenVersion ?? 0,
    });

    await new Promise((resolve) => setTimeout(resolve, 60));

    const expired = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`${REFRESH_COOKIE}=${token}`]);

    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe("REFRESH_TOKEN_EXPIRED");
  });
});

describe("password change", () => {
  it("requires the current password and invalidates existing sessions", async () => {
    const user = await createUser({ email: "password@brightloop.test" });
    const loginResponse = await login(user.email);
    const accessCookie = cookieFor(loginResponse, ACCESS_COOKIE);
    const refreshCookie = cookieFor(loginResponse, REFRESH_COOKIE);

    const wrongCurrent = await request(app)
      .patch("/api/auth/password")
      .set("Cookie", accessCookie)
      .send({ currentPassword: "WrongPass123!", newPassword: NEW_PASSWORD });

    expect(wrongCurrent.status).toBe(401);
    expect(wrongCurrent.body.error.code).toBe("INVALID_CURRENT_PASSWORD");

    const changed = await request(app)
      .patch("/api/auth/password")
      .set("Cookie", accessCookie)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(changed.status).toBe(200);

    const oldAccess = await request(app)
      .get("/api/auth/me")
      .set("Cookie", accessCookie);
    expect(oldAccess.status).toBe(401);
    expect(oldAccess.body.error.code).toBe("SESSION_REVOKED");

    const oldRefresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie);
    expect(oldRefresh.status).toBe(401);
    expect(oldRefresh.body.error.code).toBe("SESSION_REVOKED");

    const oldLogin = await login(user.email, PASSWORD);
    expect(oldLogin.status).toBe(401);

    const newLogin = await login(user.email, NEW_PASSWORD);
    expect(newLogin.status).toBe(200);

    const updatedUser = await User.findById(user._id).select("+tokenVersion");
    expect(updatedUser.tokenVersion).toBe(1);
  });
});

describe("role-based authorization", () => {
  it("allows administrators and denies staff on admin-only routes", async () => {
    const admin = await createUser({
      email: "rbac-admin@brightloop.test",
      role: "admin",
    });
    const staff = await createUser({
      email: "rbac-staff@brightloop.test",
      role: "staff",
      name: "Test Staff",
    });

    const adminLogin = await login(admin.email);
    const staffLogin = await login(staff.email);

    const adminCookie = cookieFor(adminLogin, ACCESS_COOKIE);
    const staffCookie = cookieFor(staffLogin, ACCESS_COOKIE);

    const rbacApp = express();
    rbacApp.use(express.json());
    rbacApp.use(cookieParser(env.COOKIE_SECRET));
    rbacApp.get(
      "/admin-only",
      protect,
      authorize("admin"),
      (req, res) => res.json({ success: true, data: { role: req.user.role } }),
    );
    rbacApp.use(errorHandler);

    const allowed = await request(rbacApp).get("/admin-only").set("Cookie", adminCookie);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.role).toBe("admin");

    const denied = await request(rbacApp).get("/admin-only").set("Cookie", staffCookie);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");

    const anonymous = await request(rbacApp).get("/admin-only");
    expect(anonymous.status).toBe(401);
  });
});
