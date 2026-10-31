import { describe, expect, it } from "vitest";
import { User } from "../../src/models/index.js";

const baseUser = {
  name: "Test User",
  email: "test.user@example.com",
};

describe("User model", () => {
  it("hashes a password exactly once and verifies it", async () => {
    const user = new User({ ...baseUser, role: "admin" });
    await user.setPassword("SuperSecret123!");

    expect(user.passwordHash).toMatch(/^\$2[aby]\$04\$/);
    expect(user.passwordHash).not.toContain("SuperSecret123!");
    expect(await user.verifyPassword("SuperSecret123!")).toBe(true);
    expect(await user.verifyPassword("WrongPassword123!")).toBe(false);

    await user.save();

    const stored = await User.findById(user._id).select("+passwordHash");
    expect(await stored.verifyPassword("SuperSecret123!")).toBe(true);

    // Changing the password re-hashes the new value, never the old hash.
    await stored.setPassword("AnotherSecret456!");
    await stored.save();

    const reloaded = await User.findById(user._id).select("+passwordHash");
    expect(reloaded.passwordHash).not.toBe(user.passwordHash);
    expect(await reloaded.verifyPassword("AnotherSecret456!")).toBe(true);
    expect(await reloaded.verifyPassword("SuperSecret123!")).toBe(false);
  });

  it("rejects a plaintext value in passwordHash", async () => {
    const user = new User({
      ...baseUser,
      email: "plaintext@example.com",
      passwordHash: "not-a-bcrypt-hash",
    });

    await expect(user.validate()).rejects.toThrow(/bcrypt hash/i);
  });

  it("requires a valid email address", async () => {
    const user = new User({ ...baseUser, email: "not-an-email" });
    await user.setPassword("Password123!");

    await expect(user.validate()).rejects.toThrow(/invalid/i);
  });

  it("enforces a unique email address", async () => {
    const first = new User({ ...baseUser, email: "duplicate@example.com" });
    await first.setPassword("Password123!");
    await first.save();

    const second = new User({ ...baseUser, email: "duplicate@example.com" });
    await second.setPassword("Password456!");

    await expect(second.save()).rejects.toMatchObject({ code: 11000 });
  });

  it("never exposes passwordHash or tokenVersion in JSON", async () => {
    const user = new User({ ...baseUser, email: "json@example.com" });
    await user.setPassword("Password123!");
    await user.save();

    const json = user.toJSON();
    expect(json.passwordHash).toBeUndefined();
    expect(json.tokenVersion).toBeUndefined();
    expect(json.id).toBeTypeOf("string");
  });
});
