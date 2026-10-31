import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// The normal test app disables rate limiting. This app enables it so the
// 10-attempt authentication limit can be exercised without polluting other
// test files (each file has an isolated module registry and limiter store).
const app = createApp({ rateLimitEnabled: true });

describe("authentication rate limiting", () => {
  it("blocks authentication attempts after 10 failures in the window", async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await request(app).post("/api/auth/login").send({
        email: "nobody@brightloop.test",
        password: "WrongPass123!",
      });

      expect(response.status).toBe(401);
    }

    const blocked = await request(app).post("/api/auth/login").send({
      email: "nobody@brightloop.test",
      password: "WrongPass123!",
    });

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
  });
});
