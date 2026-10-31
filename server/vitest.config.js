import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.js"],
    setupFiles: ["./tests/setup.js"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      BCRYPT_ROUNDS: "4",
      COOKIE_SECRET: "test-cookie-secret-0123456789abcdef",
      JWT_ACCESS_SECRET: "test-access-secret-0123456789abcdef",
      JWT_REFRESH_SECRET: "test-refresh-secret-0123456789abcdef",
      MONGODB_URI: "mongodb://127.0.0.1:27017/brightloop_test",
      SEED_ADMIN_NAME: "Alex Davis",
      SEED_ADMIN_EMAIL: "admin@brightloop.test",
      SEED_ADMIN_PASSWORD: "SeedPassword123!",
    },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
