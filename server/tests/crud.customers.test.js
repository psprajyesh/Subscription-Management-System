import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { AuditLog, Customer } from "../src/models/index.js";
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

describe("customers CRUD", () => {
  it("creates, reads, updates, soft-deletes, lists deleted records and restores", async () => {
    const created = await admin.post("/api/customers").send({
      name: "Acme Labs",
      email: "ACME@example.com",
      company: "Acme",
      phone: "+91 90000 00000",
      status: "active",
      billingAddress: { city: "Bengaluru", state: "Karnataka", country: "in" },
      notes: "Priority account",
    });

    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);
    expect(created.body.data.item.email).toBe("acme@example.com");
    expect(created.body.data.item.billingAddress.country).toBe("IN");

    const customerId = created.body.data.item.id;

    const fetched = await admin.get(`/api/customers/${customerId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.item.name).toBe("Acme Labs");

    const updated = await admin
      .patch(`/api/customers/${customerId}`)
      .send({ name: "Acme Labs Pvt Ltd", notes: "Updated note" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.item.name).toBe("Acme Labs Pvt Ltd");
    expect(updated.body.data.item.notes).toBe("Updated note");

    const searched = await admin.get("/api/customers?search=Acme");
    expect(searched.status).toBe(200);
    expect(searched.body.meta.total).toBe(1);

    const deleted = await admin.delete(`/api/customers/${customerId}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.item.deletedAt).toBeTruthy();

    const hidden = await admin.get(`/api/customers/${customerId}`);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe("NOT_FOUND");

    const onlyDeleted = await admin.get("/api/customers?onlyDeleted=true");
    expect(onlyDeleted.status).toBe(200);
    expect(onlyDeleted.body.meta.total).toBe(1);

    const restored = await admin.post(`/api/customers/${customerId}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.data.item.deletedAt).toBeNull();

    const visibleAgain = await admin.get(`/api/customers/${customerId}`);
    expect(visibleAgain.status).toBe(200);

    const actions = await AuditLog.find({ entityId: customerId })
      .sort({ createdAt: 1 })
      .lean();
    expect(actions.map((entry) => entry.action)).toEqual([
      "customer.created",
      "customer.updated",
      "customer.deleted",
      "customer.restored",
    ]);
    expect(actions[0].actor).toBeTruthy();
    expect(actions[0].diff.fields).toContain("name");
  });

  it("paginates, sorts and filters customer records", async () => {
    await Customer.insertMany(
      Array.from({ length: 25 }, (_, index) => ({
        name: `Customer ${String(index).padStart(2, "0")}`,
        email: `customer${index}@example.com`,
        status: index % 2 === 0 ? "active" : "inactive",
      })),
    );

    const page = await admin.get("/api/customers?page=2&limit=10");
    expect(page.status).toBe(200);
    expect(page.body.data.items).toHaveLength(10);
    expect(page.body.meta).toMatchObject({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true,
    });

    const filtered = await admin.get(
      "/api/customers?status=active&sort=name&order=asc&limit=100",
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.meta.total).toBe(13);
    expect(filtered.body.data.items[0].name).toBe("Customer 00");
    expect(filtered.body.data.items.at(-1).name).toBe("Customer 24");

    const descending = await admin.get(
      "/api/customers?sort=name&order=desc&limit=5",
    );
    expect(descending.body.data.items[0].name).toBe("Customer 24");
  });

  it("treats search input as literal text instead of a regular expression", async () => {
    await Customer.create({
      name: "Literal .* Customer",
      email: "literal@example.com",
    });
    await Customer.create({
      name: "Ordinary Customer",
      email: "ordinary@example.com",
    });

    const response = await admin.get("/api/customers?search=.*");

    expect(response.status).toBe(200);
    expect(response.body.meta.total).toBe(1);
    expect(response.body.data.items[0].name).toBe("Literal .* Customer");
  });

  it("validates input, object ids and mass-assignment fields", async () => {
    const invalidEmail = await admin.post("/api/customers").send({
      name: "Invalid",
      email: "not-an-email",
    });
    expect(invalidEmail.status).toBe(422);
    expect(invalidEmail.body.error.code).toBe("VALIDATION_ERROR");

    const massAssignment = await admin.post("/api/customers").send({
      name: "Mass Assignment",
      email: "mass@example.com",
      createdBy: "64b000000000000000000000",
    });
    expect(massAssignment.status).toBe(422);

    const invalidId = await admin.get("/api/customers/not-an-object-id");
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe("INVALID_IDENTIFIER");

    const missing = await admin.get("/api/customers/64b000000000000000000000");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });

  it("allows staff to manage customers but reserves deletion and deleted views for admins", async () => {
    const staff = await createUser({
      name: "Staff Member",
      email: "staff@brightloop.test",
      role: "staff",
    });
    const staffAgent = await loginAgent(app, staff.email);

    const created = await staffAgent.post("/api/customers").send({
      name: "Staff Customer",
      email: "staff-customer@example.com",
    });
    expect(created.status).toBe(201);

    const customerId = created.body.data.item.id;
    const staffDelete = await staffAgent.delete(`/api/customers/${customerId}`);
    expect(staffDelete.status).toBe(403);
    expect(staffDelete.body.error.code).toBe("FORBIDDEN");

    const staffDeletedView = await staffAgent.get("/api/customers?onlyDeleted=true");
    expect(staffDeletedView.status).toBe(403);

    const anonymous = await request(app).get("/api/customers");
    expect(anonymous.status).toBe(401);
  });
});
