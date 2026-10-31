import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { AuditLog, Product } from "../src/models/index.js";
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

describe("products CRUD", () => {
  it("supports product lifecycle operations and audit logging", async () => {
    const created = await admin.post("/api/products").send({
      name: "Brightloop Analytics",
      description: "Business analytics workspace",
      status: "active",
    });

    expect(created.status).toBe(201);
    expect(created.body.data.item.name).toBe("Brightloop Analytics");
    const productId = created.body.data.item.id;

    const fetched = await admin.get(`/api/products/${productId}`);
    expect(fetched.status).toBe(200);

    const updated = await admin
      .patch(`/api/products/${productId}`)
      .send({ description: "Updated description", status: "draft" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.item.status).toBe("draft");

    const filtered = await admin.get("/api/products?status=draft&search=Analytics");
    expect(filtered.status).toBe(200);
    expect(filtered.body.meta.total).toBe(1);

    const deleted = await admin.delete(`/api/products/${productId}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.item.deletedAt).toBeTruthy();

    const deletedList = await admin.get("/api/products?onlyDeleted=true");
    expect(deletedList.body.meta.total).toBe(1);

    const restored = await admin.post(`/api/products/${productId}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.data.item.deletedAt).toBeNull();

    const actions = await AuditLog.find({ entityId: productId })
      .sort({ _id: 1 })
      .lean();
    expect(actions.map((entry) => entry.action)).toEqual([
      "product.created",
      "product.updated",
      "product.deleted",
      "product.restored",
    ]);
  });

  it("allows staff to read products but not create or change them", async () => {
    const product = await Product.create({
      name: "Read Only Product",
      status: "active",
    });
    const staff = await createUser({
      email: "catalog-staff@brightloop.test",
      role: "staff",
    });
    const staffAgent = await loginAgent(app, staff.email);

    const list = await staffAgent.get("/api/products");
    expect(list.status).toBe(200);

    const get = await staffAgent.get(`/api/products/${product._id}`);
    expect(get.status).toBe(200);

    const create = await staffAgent.post("/api/products").send({
      name: "Staff Product",
    });
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe("FORBIDDEN");

    const update = await staffAgent
      .patch(`/api/products/${product._id}`)
      .send({ name: "Changed" });
    expect(update.status).toBe(403);
  });
});

describe("plans CRUD", () => {
  it("creates plans for existing products, filters them and restores them", async () => {
    const product = await Product.create({
      name: "Plan Product",
      status: "active",
    });

    const created = await admin.post("/api/plans").send({
      product: String(product._id),
      name: "Starter",
      billingCycle: "monthly",
      priceMinor: 49_900,
      trialDays: 14,
      features: ["1 workspace", "Email support"],
    });

    expect(created.status).toBe(201);
    expect(created.body.data.item.product).toBe(String(product._id));
    expect(created.body.data.item.currency).toBe("INR");
    const planId = created.body.data.item.id;

    const list = await admin.get(
      `/api/plans?product=${product._id}&billingCycle=monthly&status=active`,
    );
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);

    const updated = await admin
      .patch(`/api/plans/${planId}`)
      .send({ priceMinor: 59_900, features: ["2 workspaces"] });
    expect(updated.status).toBe(200);
    expect(updated.body.data.item.priceMinor).toBe(59_900);

    await admin.delete(`/api/plans/${planId}`).expect(200);
    await admin.get(`/api/plans/${planId}`).expect(404);

    const restored = await admin.post(`/api/plans/${planId}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.data.item.deletedAt).toBeNull();
  });

  it("rejects unknown products and staff writes", async () => {
    const invalidProduct = await admin.post("/api/plans").send({
      product: "64b000000000000000000000",
      name: "Orphan",
      billingCycle: "monthly",
      priceMinor: 1000,
    });
    expect(invalidProduct.status).toBe(422);
    expect(invalidProduct.body.error.code).toBe("INVALID_REFERENCE");

    const product = await Product.create({ name: "Staff Plan Product" });
    const staff = await createUser({
      email: "plans-staff@brightloop.test",
      role: "staff",
    });
    const staffAgent = await loginAgent(app, staff.email);

    const create = await staffAgent.post("/api/plans").send({
      product: String(product._id),
      name: "Staff Plan",
      billingCycle: "monthly",
      priceMinor: 1000,
    });
    expect(create.status).toBe(403);

    const missing = await admin.get("/api/plans/64b000000000000000000000");
    expect(missing.status).toBe(404);
  });
});
