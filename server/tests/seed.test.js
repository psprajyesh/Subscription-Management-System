import { describe, expect, it } from "vitest";
import { seedDatabase } from "../src/utils/seed.js";
import { User } from "../src/models/index.js";

describe("Demo seed", () => {
  it("creates the demo dataset and is idempotent", async () => {
    const first = await seedDatabase();
    const second = await seedDatabase();

    expect(second.counts).toEqual(first.counts);

    expect(first.counts).toMatchObject({
      users: 3,
      customers: 7,
      products: 3,
      plans: 6,
      subscriptions: 10,
      invoices: 12,
      payments: 12,
      discounts: 3,
      taxes: 3,
      staff: 3,
      notifications: 5,
      auditLogs: 3,
      settings: 1,
      counters: 2,
    });

    const admin = await User.findOne({ email: process.env.SEED_ADMIN_EMAIL }).select(
      "+passwordHash",
    );

    expect(admin).not.toBeNull();
    expect(admin.role).toBe("admin");
    expect(await admin.verifyPassword(process.env.SEED_ADMIN_PASSWORD)).toBe(true);
  });
});
