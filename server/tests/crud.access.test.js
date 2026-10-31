import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  bootstrapAdmin,
  clearDatabase,
  createUser,
  loginAgent,
} from "./helpers/fixtures.js";

const app = createApp();
let admin;

beforeEach(async () => {
  await clearDatabase();
  admin = await bootstrapAdmin(app);
});

const LIST_ENDPOINTS = [
  "/api/customers",
  "/api/products",
  "/api/plans",
  "/api/discounts",
  "/api/taxes",
  "/api/staff",
  "/api/settings",
  "/api/notifications",
];

const ID_ENDPOINTS = [
  "/api/customers",
  "/api/products",
  "/api/plans",
  "/api/discounts",
  "/api/taxes",
  "/api/staff",
  "/api/notifications",
];

describe("CRUD access control and identifier validation", () => {
  it("requires authentication for every resource", async () => {
    for (const endpoint of LIST_ENDPOINTS) {
      const response = await request(app).get(endpoint);
      expect(response.status, endpoint).toBe(401);
      expect(response.body.error.code, endpoint).toBe("UNAUTHORIZED");
    }
  });

  it("rejects malformed object ids consistently", async () => {
    for (const endpoint of ID_ENDPOINTS) {
      const response = await admin.get(`${endpoint}/not-an-object-id`);
      expect(response.status, endpoint).toBe(400);
      expect(response.body.error.code, endpoint).toBe("INVALID_IDENTIFIER");
    }
  });

  it("returns not-found envelopes for missing records", async () => {
    const missingId = "64b000000000000000000000";

    for (const endpoint of ID_ENDPOINTS) {
      const response = await admin.get(`${endpoint}/${missingId}`);
      expect(response.status, endpoint).toBe(404);
      expect(response.body.error.code, endpoint).toBe("NOT_FOUND");
    }
  });

  it("validates list query parameters and rejects unknown filters", async () => {
    const invalidLimit = await admin.get("/api/customers?limit=500");
    expect(invalidLimit.status).toBe(422);

    const invalidSort = await admin.get("/api/customers?sort=passwordHash");
    expect(invalidSort.status).toBe(422);

    const invalidFilter = await admin.get("/api/customers?status=deleted");
    expect(invalidFilter.status).toBe(422);

    const unknownFilter = await admin.get("/api/customers?foo=bar");
    expect(unknownFilter.status).toBe(422);

    const contradictoryDeletedView = await admin.get(
      "/api/customers?includeDeleted=true&onlyDeleted=true",
    );
    expect(contradictoryDeletedView.status).toBe(422);
  });

  it("denies staff access to administrator-only writes across resources", async () => {
    const staff = await createUser({
      email: "access-staff@brightloop.test",
      role: "staff",
    });
    const staffAgent = await loginAgent(app, staff.email);

    const requests = [
      staffAgent.post("/api/products").send({ name: "Denied Product" }),
      staffAgent.post("/api/plans").send({
        product: "64b000000000000000000000",
        name: "Denied Plan",
        billingCycle: "monthly",
        priceMinor: 1000,
      }),
      staffAgent.post("/api/discounts").send({
        code: "DENIED",
        type: "percentage",
        value: 10,
        duration: "once",
      }),
      staffAgent.post("/api/taxes").send({
        name: "Denied Tax",
        rateBasisPoints: 100,
      }),
      staffAgent.post("/api/staff").send({
        name: "Denied Staff",
        email: "denied@brightloop.test",
        password: "StrongPass123!",
      }),
      staffAgent.patch("/api/settings").send({ workspaceName: "Denied" }),
      staffAgent.post("/api/notifications").send({
        userId: "64b000000000000000000000",
        type: "system",
        title: "Denied",
      }),
    ];

    const responses = await Promise.all(requests);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    }
  });
});
