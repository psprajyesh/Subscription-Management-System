import mongoose from "mongoose";
import { afterAll, beforeAll } from "vitest";
import { connectDB } from "../src/config/db.js";

const TEST_URI =
  process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/brightloop_test";

const databaseName = TEST_URI.split("/").pop()?.split("?")[0] ?? "";

// Safety net: never run destructive test hooks against a non-test database.
if (!/test/i.test(databaseName)) {
  throw new Error(
    `Refusing to run tests against "${databaseName || TEST_URI}": the database name must contain "test".`,
  );
}

// Tests build indexes explicitly after dropping the database, so disable
// Mongoose's automatic (and cached) index creation for this process.
mongoose.set("autoIndex", false);

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await connectDB(TEST_URI);
  }

  await mongoose.connection.dropDatabase();

  // Build every index that the imported models declare before tests run.
  await Promise.all(Object.values(mongoose.models).map((Model) => Model.createIndexes()));
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
});
