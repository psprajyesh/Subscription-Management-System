import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { AuditLog, Product, Settings, Tax } from "../src/models/index.js";
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

describe("discounts CRUD", () => {
  it("supports discount lifecycle operations and reference validation", async () => {
    const product = await Product.create({ name: "Discount Product", status: "active" });

    const created = await admin.post("/api/discounts").send({
      code: "welcome10",
      type: "percentage",
      value: 10,
      duration: "once",
      appliesToProducts: [String(product._id)],
    });

    expect(created.status).toBe(201);
    expect(created.body.data.item.code).toBe("WELCOME10");
    expect(created.body.data.item.status).toBe("active");
    const discountId = created.body.data.item.id;

    const list = await admin.get(
      "/api/discounts?type=percentage&status=active&search=welcome",
    );
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);

    const updated = await admin
      .patch(`/api/discounts/${discountId}`)
      .send({ value: 15, maxRedemptions: 100 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.item.value).toBe(15);

    const deleted = await admin.delete(`/api/discounts/${discountId}`);
    expect(deleted.status).toBe(200);

    const deletedList = await admin.get("/api/discounts?onlyDeleted=true");
    expect(deletedList.body.meta.total).toBe(1);

    const restored = await admin.post(`/api/discounts/${discountId}/restore`);
    expect(restored.status).toBe(200);

    const actions = await AuditLog.find({ entityId: discountId })
      .sort({ _id: 1 })
      .lean();
    expect(actions.map((entry) => entry.action)).toEqual([
      "discount.created",
      "discount.updated",
      "discount.deleted",
      "discount.restored",
    ]);
  });

  it("validates percentage limits, repeating durations and references", async () => {
    const overLimit = await admin.post("/api/discounts").send({
      code: "TOOMUCH",
      type: "percentage",
      value: 150,
      duration: "once",
    });
    expect(overLimit.status).toBe(422);

    const missingMonths = await admin.post("/api/discounts").send({
      code: "REPEAT",
      type: "percentage",
      value: 10,
      duration: "repeating",
    });
    expect(missingMonths.status).toBe(422);

    const invalidReference = await admin.post("/api/discounts").send({
      code: "ORPHAN",
      type: "fixed",
      value: 1000,
      duration: "once",
      appliesToPlans: ["64b000000000000000000000"],
    });
    expect(invalidReference.status).toBe(422);
    expect(invalidReference.body.error.code).toBe("INVALID_REFERENCE");

    const staff = await createUser({
      email: "discount-staff@brightloop.test",
      role: "staff",
    });
    const staffAgent = await loginAgent(app, staff.email);
    const denied = await staffAgent.post("/api/discounts").send({
      code: "STAFF10",
      type: "percentage",
      value: 10,
      duration: "once",
    });
    expect(denied.status).toBe(403);
  });
});

describe("taxes CRUD", () => {
  it("keeps a single default tax and supports lifecycle operations", async () => {
    const first = await admin.post("/api/taxes").send({
      name: "Standard GST",
      country: "in",
      rateBasisPoints: 1800,
      isDefault: true,
    });
    expect(first.status).toBe(201);
    expect(first.body.data.item.country).toBe("IN");
    const firstId = first.body.data.item.id;

    const second = await admin.post("/api/taxes").send({
      name: "Reduced GST",
      rateBasisPoints: 500,
      isDefault: true,
    });
    expect(second.status).toBe(201);
    const secondId = second.body.data.item.id;

    const firstAfter = await admin.get(`/api/taxes/${firstId}`);
    expect(firstAfter.status).toBe(200);
    expect(firstAfter.body.data.item.isDefault).toBe(false);

    const defaults = await admin.get("/api/taxes?isDefault=true");
    expect(defaults.status).toBe(200);
    expect(defaults.body.meta.total).toBe(1);
    expect(defaults.body.data.items[0].id).toBe(secondId);

    const updated = await admin
      .patch(`/api/taxes/${secondId}`)
      .send({ name: "Reduced GST 5%", status: "active" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.item.name).toBe("Reduced GST 5%");

    await Settings.getSingleton();
    await admin.patch("/api/settings").send({ defaultTax: secondId }).expect(200);

    await admin.delete(`/api/taxes/${secondId}`).expect(200);

    const settings = await admin.get("/api/settings");
    expect(settings.status).toBe(200);
    expect(settings.body.data.item.defaultTax).toBeNull();

    const restored = await admin.post(`/api/taxes/${secondId}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.data.item.deletedAt).toBeNull();

    const actions = await AuditLog.find({ entityId: secondId })
      .sort({ _id: 1 })
      .lean();
    expect(actions.map((entry) => entry.action)).toEqual([
      "tax.created",
      "tax.updated",
      "tax.deleted",
      "tax.restored",
    ]);
  });

  it("allows staff to read taxes but not modify them", async () => {
    const tax = await Tax.create({
      name: "Readable Tax",
      rateBasisPoints: 1800,
    });
    const staff = await createUser({
      email: "tax-staff@brightloop.test",
      role: "staff",
    });
    const staffAgent = await loginAgent(app, staff.email);

    await staffAgent.get("/api/taxes").expect(200);
    await staffAgent.get(`/api/taxes/${tax._id}`).expect(200);

    const create = await staffAgent.post("/api/taxes").send({
      name: "Staff Tax",
      rateBasisPoints: 100,
    });
    expect(create.status).toBe(403);

    const update = await staffAgent
      .patch(`/api/taxes/${tax._id}`)
      .send({ rateBasisPoints: 200 });
    expect(update.status).toBe(403);
  });
});
