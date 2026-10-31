import request from "supertest";
import {
  AuditLog,
  Counter,
  Customer,
  Discount,
  Invoice,
  Notification,
  Payment,
  Plan,
  Product,
  RefreshToken,
  Settings,
  Staff,
  Subscription,
  Tax,
  User,
} from "../../src/models/index.js";

export const PASSWORD = "StrongPass123!";

const COLLECTIONS = [
  AuditLog,
  RefreshToken,
  Notification,
  Staff,
  Tax,
  Discount,
  Plan,
  Product,
  Subscription,
  Invoice,
  Payment,
  Customer,
  Settings,
  User,
  Counter,
];

export async function clearDatabase() {
  await Promise.all(COLLECTIONS.map((Model) => Model.deleteMany({})));
}

export async function createUser({
  name = "Test User",
  email = "user@brightloop.test",
  role = "staff",
  status = "active",
  password = PASSWORD,
} = {}) {
  const user = new User({ name, email, role, status });
  await user.setPassword(password);
  await user.save();
  return user;
}

export async function loginAgent(app, email, password = PASSWORD) {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({ email, password });

  if (response.status !== 200) {
    throw new Error(
      `Login failed for ${email} (${response.status}): ${JSON.stringify(response.body)}`,
    );
  }

  return agent;
}

export async function bootstrapAdmin(
  app,
  {
    name = "Test Admin",
    email = "admin@brightloop.test",
    password = PASSWORD,
  } = {},
) {
  const response = await request(app).post("/api/auth/register").send({
    name,
    email,
    password,
  });

  if (response.status !== 201) {
    throw new Error(
      `Admin bootstrap failed (${response.status}): ${JSON.stringify(response.body)}`,
    );
  }

  return loginAgent(app, email, password);
}

export async function currentUserId(agent) {
  const response = await agent.get("/api/auth/me");

  if (response.status !== 200) {
    throw new Error(`Unable to load current user: ${JSON.stringify(response.body)}`);
  }

  return response.body.data.user.id;
}
