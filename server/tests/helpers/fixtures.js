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

export async function createCustomerFixture({
  name = "Acme Labs",
  email = "acme@brightloop.test",
  status = "active",
  company = "Acme",
} = {}) {
  return Customer.create({ name, email, company, status });
}

export async function createCatalog({
  productName = "Brightloop Analytics",
  planName = "Starter",
  billingCycle = "monthly",
  priceMinor = 100_000,
  trialDays = 0,
  planStatus = "active",
  productStatus = "active",
} = {}) {
  const product = await Product.create({
    name: productName,
    status: productStatus,
  });

  const plan = await Plan.create({
    product: product._id,
    name: planName,
    billingCycle,
    priceMinor,
    trialDays,
    status: planStatus,
  });

  return { product, plan };
}

export async function createSubscriptionFixture({
  customer,
  plan,
  status = "active",
  quantity = 1,
  priceMinor = plan.priceMinor,
  billingCycle = plan.billingCycle,
  startedAt = new Date("2026-01-01T00:00:00.000Z"),
  billingAnchorDay = new Date(startedAt).getUTCDate(),
  currentPeriodStart = startedAt,
  currentPeriodEnd = new Date(
    new Date(startedAt).getTime() + 31 * 24 * 60 * 60 * 1000,
  ),
  nextBillingAt = currentPeriodEnd,
  trialEndsAt = null,
  taxRateBasisPoints = 0,
  ...overrides
} = {}) {
  return Subscription.create({
    customer: customer._id,
    plan: plan._id,
    status,
    quantity,
    priceMinor,
    billingCycle,
    billingAnchorDay,
    currency: "INR",
    taxRateBasisPoints,
    startedAt,
    trialEndsAt,
    currentPeriodStart,
    currentPeriodEnd,
    nextBillingAt,
    ...overrides,
  });
}

