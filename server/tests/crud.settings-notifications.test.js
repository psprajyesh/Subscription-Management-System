import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { AuditLog, Tax } from "../src/models/index.js";
import {
  bootstrapAdmin,
  clearDatabase,
  createUser,
  currentUserId,
  loginAgent,
} from "./helpers/fixtures.js";

const app = createApp();
let admin;

beforeEach(async () => {
  await clearDatabase();
  admin = await bootstrapAdmin(app);
});

describe("settings", () => {
  it("reads settings for all authenticated users and restricts writes to admins", async () => {
    const initial = await admin.get("/api/settings");
    expect(initial.status).toBe(200);
    expect(initial.body.data.item.workspaceName).toBe("Brightloop Software");

    const staff = await createUser({
      email: "settings-staff@brightloop.test",
      role: "staff",
    });
    const staffAgent = await loginAgent(app, staff.email);

    await staffAgent.get("/api/settings").expect(200);

    const denied = await staffAgent
      .patch("/api/settings")
      .send({ workspaceName: "Staff Workspace" });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");

    const tax = await Tax.create({
      name: "Settings GST",
      rateBasisPoints: 1800,
      status: "active",
    });

    const updated = await admin.patch("/api/settings").send({
      workspaceName: "Brightloop Test",
      invoicePrefix: "bl",
      invoiceDueDays: 10,
      supportEmail: "Billing@Brightloop.Test",
      defaultTax: String(tax._id),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.item.workspaceName).toBe("Brightloop Test");
    expect(updated.body.data.item.invoicePrefix).toBe("BL");
    expect(updated.body.data.item.supportEmail).toBe("billing@brightloop.test");
    expect(updated.body.data.item.defaultTax).toBe(String(tax._id));

    const audit = await AuditLog.findOne({ action: "settings.updated" }).lean();
    expect(audit).toBeTruthy();
    expect(audit.diff.fields).toContain("workspaceName");
    expect(JSON.stringify(audit)).not.toContain("password");
  });

  it("rejects protected and invalid settings fields", async () => {
    const protectedKey = await admin
      .patch("/api/settings")
      .send({ key: "hacked" });
    expect(protectedKey.status).toBe(422);

    const invalidCurrency = await admin
      .patch("/api/settings")
      .send({ currency: "USD" });
    expect(invalidCurrency.status).toBe(422);

    const invalidDefaultTax = await admin
      .patch("/api/settings")
      .send({ defaultTax: "64b000000000000000000000" });
    expect(invalidDefaultTax.status).toBe(422);
    expect(invalidDefaultTax.body.error.code).toBe("INVALID_DEFAULT_TAX");
  });
});

describe("notifications", () => {
  it("supports create, read/unread, read-all, update and delete operations", async () => {
    const adminId = await currentUserId(admin);

    const created = await admin.post("/api/notifications").send({
      userId: adminId,
      type: "system",
      title: "Welcome",
      message: "Workspace ready",
    });
    expect(created.status).toBe(201);
    expect(created.body.data.item.user).toBe(adminId);
    const notificationId = created.body.data.item.id;

    const list = await admin.get("/api/notifications");
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);

    const unread = await admin.get("/api/notifications/unread-count");
    expect(unread.status).toBe(200);
    expect(unread.body.data.count).toBe(1);

    const read = await admin.patch(`/api/notifications/${notificationId}/read`);
    expect(read.status).toBe(200);
    expect(read.body.data.item.readAt).toBeTruthy();

    const unreadAfterRead = await admin.get("/api/notifications/unread-count");
    expect(unreadAfterRead.body.data.count).toBe(0);

    const readFilter = await admin.get("/api/notifications?read=true");
    expect(readFilter.body.meta.total).toBe(1);

    const unreadAgain = await admin.patch(`/api/notifications/${notificationId}/unread`);
    expect(unreadAgain.status).toBe(200);
    expect(unreadAgain.body.data.item.readAt).toBeNull();

    const updated = await admin
      .patch(`/api/notifications/${notificationId}`)
      .send({ title: "Welcome updated" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.item.title).toBe("Welcome updated");

    const second = await admin.post("/api/notifications").send({
      userId: adminId,
      type: "system",
      title: "Second",
    });
    expect(second.status).toBe(201);

    const readAll = await admin.patch("/api/notifications/read-all");
    expect(readAll.status).toBe(200);
    expect(readAll.body.data.updated).toBe(2);

    const countAfterAll = await admin.get("/api/notifications/unread-count");
    expect(countAfterAll.body.data.count).toBe(0);

    const deleted = await admin.delete(`/api/notifications/${notificationId}`);
    expect(deleted.status).toBe(200);

    await admin.get(`/api/notifications/${notificationId}`).expect(404);

    const auditActions = await AuditLog.find({ entityType: "Notification" })
      .sort({ _id: 1 })
      .lean();
    expect(auditActions.map((entry) => entry.action)).toContain("notification.created");
    expect(auditActions.map((entry) => entry.action)).toContain("notification.updated");
    expect(auditActions.map((entry) => entry.action)).toContain("notification.deleted");
  });

  it("scopes notifications to the owning user and restricts admin actions", async () => {
    const adminId = await currentUserId(admin);
    const staff = await createUser({
      name: "Notification Staff",
      email: "notification-staff@brightloop.test",
      role: "staff",
    });
    const staffAgent = await loginAgent(app, staff.email);

    const staffNotification = await admin.post("/api/notifications").send({
      userId: String(staff._id),
      type: "system",
      title: "For staff",
    });
    expect(staffNotification.status).toBe(201);
    const staffNotificationId = staffNotification.body.data.item.id;

    const adminNotification = await admin.post("/api/notifications").send({
      userId: adminId,
      type: "system",
      title: "For admin",
    });
    const adminNotificationId = adminNotification.body.data.item.id;

    const staffList = await staffAgent.get("/api/notifications");
    expect(staffList.status).toBe(200);
    expect(staffList.body.meta.total).toBe(1);
    expect(staffList.body.data.items[0].id).toBe(staffNotificationId);

    const otherUsersNotification = await staffAgent.get(
      `/api/notifications/${adminNotificationId}`,
    );
    expect(otherUsersNotification.status).toBe(404);

    const adminOnlyCreate = await staffAgent.post("/api/notifications").send({
      userId: String(staff._id),
      type: "system",
      title: "Staff attempt",
    });
    expect(adminOnlyCreate.status).toBe(403);

    const adminOnlyUpdate = await staffAgent
      .patch(`/api/notifications/${staffNotificationId}`)
      .send({ title: "Staff edit" });
    expect(adminOnlyUpdate.status).toBe(403);

    const markRead = await staffAgent.patch(
      `/api/notifications/${staffNotificationId}/read`,
    );
    expect(markRead.status).toBe(200);
    expect(markRead.body.data.item.readAt).toBeTruthy();

    const deleteOwn = await staffAgent.delete(
      `/api/notifications/${staffNotificationId}`,
    );
    expect(deleteOwn.status).toBe(200);

    const adminDeleteOther = await admin.delete(
      `/api/notifications/${adminNotificationId}`,
    );
    expect(adminDeleteOther.status).toBe(200);
  });
});
