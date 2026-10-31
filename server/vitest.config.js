import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.js"],
    setupFiles: ["./tests/setup.js"],
    env: {
      NODE_ENV: "test",
      COOKIE_SECRET: "test-cookie-secret-0123456789abcdef",
      JWT_ACCESS_SECRET: "test-access-secret-0123456789abcdef",
      JWT_REFRESH_SECRET: "test-refresh-secret-0123456789abcdef",
      MONGODB_URI: "mongodb://127.0.0.1:27017/brightloop-test",
    },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
