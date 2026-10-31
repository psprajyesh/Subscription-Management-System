import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { AuditLog, User } from "../src/models/index.js";
import {
  bootstrapAdmin,
  clearDatabase,
  loginAgent,
  PASSWORD,
} from "./helpers/fixtures.js";

const app = createApp();
let admin;

beforeEach(async () => {
  await clearDatabase();
  admin = await bootstrapAdmin(app);
});

describe("staff CRUD", () => {
  it("creates a staff account, updates it and enforces role permissions", async () => {
    const created = await admin.post("/api/staff").send({
      name: "Jordan Lee",
      email: "jordan@brightloop.test",
      password: PASSWORD,
      title: "Billing manager",
      phone: "+91 90000 11111",
      permissions: ["invoices:manage", "payments:read"],
      status: "active",
    });

    expect(created.status).toBe(201);
    expect(created.body.data.item.user.email).toBe("jordan@brightloop.test");
    expect(created.body.data.item.user.role).toBe("staff");
    expect(created.body.data.item.user.passwordHash).toBeUndefined();
    expect(created.body.data.item.passwordHash).toBeUndefined();
    expect(created.body.data.item.status).toBe("active");

    const staffId = created.body.data.item.id;
    const staffAgent = await loginAgent(app, "jordan@brightloop.test");

    const me = await staffAgent.get("/api/staff/me");
    expect(me.status).toBe(200);
    expect(me.body.data.item.id).toBe(staffId);

    const listAsStaff = await staffAgent.get("/api/staff");
    expect(listAsStaff.status).toBe(403);

    const getAsStaff = await staffAgent.get(`/api/staff/${staffId}`);
    expect(getAsStaff.status).toBe(403);

    const createAsStaff = await staffAgent.post("/api/staff").send({
      name: "Another",
      email: "another@brightloop.test",
      password: PASSWORD,
    });
    expect(createAsStaff.status).toBe(403);

    const listAsAdmin = await admin.get("/api/staff?search=Jordan&status=active");
    expect(listAsAdmin.status).toBe(200);
    expect(listAsAdmin.body.meta.total).toBe(1);
    expect(listAsAdmin.body.data.items[0].user.name).toBe("Jordan Lee");

    const updated = await admin
      .patch(`/api/staff/${staffId}`)
      .send({ title: "Billing lead", phone: "+91 90000 22222" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.item.title).toBe("Billing lead");

    const actions = await AuditLog.find({ entityId: staffId })
      .sort({ _id: 1 })
      .lean();
    expect(actions.map((entry) => entry.action)).toContain("staff.created");
    expect(actions.map((entry) => entry.action)).toContain("staff.updated");
    expect(JSON.stringify(actions)).not.toContain(PASSWORD);
  });

  it("suspends the account when staff is deleted and revives it on restore", async () => {
    const created = await admin.post("/api/staff").send({
      name: "Taylor Smith",
      email: "taylor@brightloop.test",
      password: PASSWORD,
      status: "active",
    });
    const staffId = created.body.data.item.id;

    const suspended = await admin
      .patch(`/api/staff/${staffId}`)
      .send({ status: "suspended" });
    expect(suspended.status).toBe(200);

    const blockedLogin = await request(app).post("/api/auth/login").send({
      email: "taylor@brightloop.test",
      password: PASSWORD,
    });
    expect(blockedLogin.status).toBe(403);
    expect(blockedLogin.body.error.code).toBe("ACCOUNT_INACTIVE");

    await admin.patch(`/api/staff/${staffId}`).send({ status: "active" }).expect(200);
    await loginAgent(app, "taylor@brightloop.test");

    await admin.delete(`/api/staff/${staffId}`).expect(200);

    const deletedUser = await User.findOne({ email: "taylor@brightloop.test" });
    expect(deletedUser.status).toBe("suspended");

    const blockedAfterDelete = await request(app).post("/api/auth/login").send({
      email: "taylor@brightloop.test",
      password: PASSWORD,
    });
    expect(blockedAfterDelete.status).toBe(403);

    await admin.get(`/api/staff/${staffId}`).expect(404);

    const deletedList = await admin.get("/api/staff?onlyDeleted=true");
    expect(deletedList.status).toBe(200);
    expect(deletedList.body.meta.total).toBe(1);

    const restored = await admin.post(`/api/staff/${staffId}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.data.item.deletedAt).toBeNull();

    const restoredUser = await User.findOne({ email: "taylor@brightloop.test" });
    expect(restoredUser.status).toBe("active");

    await loginAgent(app, "taylor@brightloop.test");
  });

  it("validates staff input and protects sensitive/administrator fields", async () => {
    const roleEscalation = await admin.post("/api/staff").send({
      name: "Would Be Admin",
      email: "escalate@brightloop.test",
      password: PASSWORD,
      role: "admin",
    });
    expect(roleEscalation.status).toBe(422);

    const hashMassAssignment = await admin.post("/api/staff").send({
      name: "Hash Attempt",
      email: "hash@brightloop.test",
      password: PASSWORD,
      passwordHash: "$2b$04$abcdefghijklmnopqrstuv",
    });
    expect(hashMassAssignment.status).toBe(422);

    const duplicatePermissions = await admin.post("/api/staff").send({
      name: "Duplicate Permissions",
      email: "duplicate@brightloop.test",
      password: PASSWORD,
      permissions: ["customers:read", "customers:read"],
    });
    expect(duplicatePermissions.status).toBe(422);

    const invalidId = await admin.get("/api/staff/not-an-object-id");
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe("INVALID_IDENTIFIER");

    const missing = await admin.get("/api/staff/64b000000000000000000000");
    expect(missing.status).toBe(404);
  });

  it("prevents an administrator from deleting their own staff profile", async () => {
    const me = await admin.get("/api/staff/me");
    expect(me.status).toBe(200);

    const response = await admin.delete(`/api/staff/${me.body.data.item.id}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CANNOT_DELETE_SELF");
  });
});
