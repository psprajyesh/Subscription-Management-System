import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("API scaffold", () => {
  it("GET /api/health returns a success envelope", async () => {
    const response = await request(app).get("/api/health").expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("ok");
    expect(response.body.data.environment).toBe("test");
    expect(response.body.data.timestamp).toBeTypeOf("string");
  });

  it("returns a structured 404 for unknown routes", async () => {
    const response = await request(app).get("/api/does-not-exist").expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects malformed JSON bodies with a structured error", async () => {
    const response = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send('{"broken":')
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });
});
