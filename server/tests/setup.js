import { afterAll, beforeAll } from "vitest";

/**
 * Shared test setup. Database helpers are added when models land (Phase 2);
 * for now the setup only guarantees deterministic environment behaviour.
 */
beforeAll(() => {
  process.env.NODE_ENV = "test";
});

afterAll(() => {
  // Placeholder for database teardown added in Phase 2.
});
