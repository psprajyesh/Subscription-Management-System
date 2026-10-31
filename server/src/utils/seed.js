import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { logger } from "./logger.js";
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
  Settings,
  Staff,
  Subscription,
  Tax,
  User,
} from "../models/index.js";

const iso = (date, hour = 10) => new Date(`${date}T${String(hour).padStart(2, "0")}:00:00.000Z`);

const roundTax = (subtotalMinor, rateBasisPoints) =>
  Math.round((subtotalMinor * rateBasisPoints) / 10_000);

/**
 * Upsert with deterministic natural keys so running the seed twice
 * never duplicates records or overwrites user edits.
 */
async function upsertOne(Model, filter, doc) {
  const now = new Date();
  return Model.findOneAndUpdate(
    filter,
    {
      $setOnInsert: {
        ...doc,
        createdAt: doc.createdAt ?? now,
        updatedAt: doc.updatedAt ?? now,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
      timestamps: false,
    },
  );
}

async function ensureUser({ name, email, role, status, password }) {
  const existing = await User.findOne({ email });
  if (existing) return existing;

  const user = new User({ name, email, role, status });
  await user.setPassword(password);
  await user.save();
  return user;
}

const productSpecs = [
  {
    name: "Brightloop Analytics",
    description: "Business analytics workspace",
    status: "active",
  },
  {
    name: "Team Workspace",
    description: "Collaboration suite",
    status: "active",
  },
  {
    name: "API Access",
    description: "Developer API package",
    status: "draft",
  },
];

const planSpecs = [
  {
    product: "Brightloop Analytics",
    name: "Starter",
    billingCycle: "monthly",
    priceMinor: 49_900,
    trialDays: 14,
    features: ["1 workspace", "Core dashboards", "Email support"],
  },
  {
    product: "Brightloop Analytics",
    name: "Professional",
    billingCycle: "monthly",
    priceMinor: 149_900,
    trialDays: 14,
    features: ["5 workspaces", "Advanced analytics", "Priority support"],
  },
  {
    product: "Brightloop Analytics",
    name: "Business",
    billingCycle: "yearly",
    priceMinor: 2_999_900,
    trialDays: 30,
    features: ["Unlimited workspaces", "Custom reports", "Dedicated support"],
  },
  {
    product: "Team Workspace",
    name: "Team",
    billingCycle: "monthly",
    priceMinor: 99_900,
    trialDays: 14,
    features: ["Shared inbox", "Team roles", "Slack integration"],
  },
  {
    product: "Team Workspace",
    name: "Team",
    billingCycle: "yearly",
    priceMinor: 999_900,
    trialDays: 30,
    features: ["Shared inbox", "Team roles", "Slack integration", "2 months free"],
  },
  {
    product: "API Access",
    name: "Developer",
    billingCycle: "monthly",
    priceMinor: 199_900,
    trialDays: 7,
    features: ["100k API calls", "Sandbox access", "Developer support"],
  },
];

const customerSpecs = [
  { name: "Maya Johnson", email: "maya.j@email.com", company: "Northwind Labs", joined: "2026-10-21" },
  { name: "Noah Williams", email: "noah.w@email.com", company: "Williams Studio", joined: "2026-10-19" },
  { name: "Ava Thompson", email: "ava.t@email.com", company: "Thompson & Co", joined: "2026-10-16" },
  { name: "Sophie Carter", email: "sophie.carter@email.com", company: "Carter Digital", joined: "2026-09-28" },
  { name: "James Miller", email: "j.miller@email.com", company: "Miller Freelance", joined: "2026-10-02" },
  { name: "Olivia Wilson", email: "olivia.w@email.com", company: "Wilson Group", joined: "2026-08-14" },
  { name: "Ethan Brown", email: "ethan.b@email.com", company: "Brown Consulting", joined: "2026-09-25" },
];

const subscriptionSpecs = [
  {
    email: "sophie.carter@email.com",
    plan: ["Brightloop Analytics", "Professional", "monthly"],
    status: "active",
    started: "2026-09-28",
    periodStart: "2026-10-28",
    periodEnd: "2026-11-28",
    nextBilling: "2026-11-28",
  },
  {
    email: "j.miller@email.com",
    plan: ["Brightloop Analytics", "Starter", "monthly"],
    status: "active",
    started: "2026-10-02",
    periodStart: "2026-10-02",
    periodEnd: "2026-11-02",
    nextBilling: "2026-11-02",
  },
  {
    email: "olivia.w@email.com",
    plan: ["Brightloop Analytics", "Business", "yearly"],
    status: "active",
    started: "2026-08-14",
    periodStart: "2026-08-14",
    periodEnd: "2027-08-14",
    nextBilling: "2027-08-14",
  },
  {
    email: "ethan.b@email.com",
    plan: ["Brightloop Analytics", "Professional", "monthly"],
    status: "past_due",
    started: "2026-09-25",
    periodStart: "2026-09-25",
    periodEnd: "2026-10-25",
    nextBilling: "2026-10-25",
  },
  {
    email: "maya.j@email.com",
    plan: ["Brightloop Analytics", "Business", "yearly"],
    status: "active",
    started: "2026-07-21",
    periodStart: "2026-07-21",
    periodEnd: "2027-07-21",
    nextBilling: "2027-07-21",
  },
  {
    email: "maya.j@email.com",
    plan: ["Team Workspace", "Team", "yearly"],
    status: "active",
    started: "2026-08-01",
    periodStart: "2026-08-01",
    periodEnd: "2027-08-01",
    nextBilling: "2027-08-01",
  },
  {
    email: "maya.j@email.com",
    plan: ["API Access", "Developer", "monthly"],
    status: "active",
    started: "2026-10-21",
    periodStart: "2026-10-21",
    periodEnd: "2026-11-21",
    nextBilling: "2026-11-21",
  },
  {
    email: "noah.w@email.com",
    plan: ["Brightloop Analytics", "Starter", "monthly"],
    status: "active",
    started: "2026-10-19",
    periodStart: "2026-10-19",
    periodEnd: "2026-11-19",
    nextBilling: "2026-11-19",
  },
  {
    email: "ava.t@email.com",
    plan: ["Brightloop Analytics", "Professional", "monthly"],
    status: "active",
    started: "2026-10-16",
    periodStart: "2026-10-16",
    periodEnd: "2026-11-16",
    nextBilling: "2026-11-16",
  },
  {
    email: "ava.t@email.com",
    plan: ["Team Workspace", "Team", "yearly"],
    status: "trialing",
    started: "2026-10-16",
    periodStart: "2026-10-16",
    periodEnd: "2026-11-05",
    nextBilling: "2026-11-05",
    trialEnd: "2026-10-30",
  },
];

const invoiceSpecs = [
  { number: "INV-2026-1048", email: "sophie.carter@email.com", plan: ["Brightloop Analytics", "Professional", "monthly"], status: "paid", issue: "2026-10-28", due: "2026-10-28", paid: "2026-10-28" },
  { number: "INV-2026-1047", email: "j.miller@email.com", plan: ["Brightloop Analytics", "Starter", "monthly"], status: "open", issue: "2026-10-27", due: "2026-11-03" },
  { number: "INV-2026-1046", email: "olivia.w@email.com", plan: ["Brightloop Analytics", "Business", "yearly"], status: "paid", issue: "2026-10-26", due: "2026-10-26", paid: "2026-10-26" },
  { number: "INV-2026-1045", email: "ethan.b@email.com", plan: ["Brightloop Analytics", "Professional", "monthly"], status: "overdue", issue: "2026-10-25", due: "2026-10-30" },
  { number: "INV-2026-1044", email: "maya.j@email.com", plan: ["Brightloop Analytics", "Business", "yearly"], status: "paid", issue: "2026-09-28", due: "2026-09-28", paid: "2026-09-28" },
  { number: "INV-2026-1043", email: "sophie.carter@email.com", plan: ["Brightloop Analytics", "Professional", "monthly"], status: "paid", issue: "2026-09-28", due: "2026-09-28", paid: "2026-09-28" },
  { number: "INV-2026-1042", email: "olivia.w@email.com", plan: ["Brightloop Analytics", "Business", "yearly"], status: "paid", issue: "2026-08-26", due: "2026-08-26", paid: "2026-08-26" },
  { number: "INV-2026-1041", email: "noah.w@email.com", plan: ["Brightloop Analytics", "Starter", "monthly"], status: "paid", issue: "2026-09-19", due: "2026-09-19", paid: "2026-09-19" },
  { number: "INV-2026-1040", email: "ava.t@email.com", plan: ["Team Workspace", "Team", "yearly"], status: "paid", issue: "2026-08-16", due: "2026-08-16", paid: "2026-08-16" },
  { number: "INV-2026-1039", email: "maya.j@email.com", plan: ["Team Workspace", "Team", "yearly"], status: "paid", issue: "2026-08-01", due: "2026-08-01", paid: "2026-08-01" },
  { number: "INV-2026-1038", email: "maya.j@email.com", plan: ["API Access", "Developer", "monthly"], status: "paid", issue: "2026-10-21", due: "2026-10-21", paid: "2026-10-21" },
  { number: "INV-2026-1037", email: "ava.t@email.com", plan: ["Brightloop Analytics", "Professional", "monthly"], status: "paid", issue: "2026-10-16", due: "2026-10-16", paid: "2026-10-16" },
];

const paymentSpecs = [
  { number: "PAY-882104", invoice: "INV-2026-1048", status: "captured", method: "Visa •••• 4242" },
  { number: "PAY-882103", invoice: "INV-2026-1047", status: "created", method: "Mastercard •••• 8210" },
  { number: "PAY-882102", invoice: "INV-2026-1046", status: "captured", method: "Visa •••• 1122" },
  { number: "PAY-882101", invoice: "INV-2026-1045", status: "failed", method: "Mastercard •••• 8210", failureReason: "Card declined by issuer" },
  { number: "PAY-882100", invoice: "INV-2026-1044", status: "captured", method: "Visa •••• 4242" },
  { number: "PAY-882099", invoice: "INV-2026-1043", status: "captured", method: "Visa •••• 4242" },
  { number: "PAY-882098", invoice: "INV-2026-1042", status: "captured", method: "Visa •••• 1122" },
  { number: "PAY-882097", invoice: "INV-2026-1041", status: "captured", method: "Mastercard •••• 8210" },
  { number: "PAY-882096", invoice: "INV-2026-1040", status: "captured", method: "Mastercard •••• 8210" },
  { number: "PAY-882095", invoice: "INV-2026-1039", status: "captured", method: "Visa •••• 1122" },
  { number: "PAY-882094", invoice: "INV-2026-1038", status: "captured", method: "Visa •••• 4242" },
  { number: "PAY-882093", invoice: "INV-2026-1037", status: "captured", method: "Mastercard •••• 8210" },
];

export async function seedDatabase() {
  const adminPassword = env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 8) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is missing or too short. Set it in server/.env before running the seed.",
    );
  }

  await Promise.all(Object.values(mongoose.models).map((Model) => Model.syncIndexes()));

  // --- Team -----------------------------------------------------------------
  const admin = await ensureUser({
    name: env.SEED_ADMIN_NAME,
    email: env.SEED_ADMIN_EMAIL,
    role: "admin",
    status: "active",
    password: adminPassword,
  });

  const jordan = await ensureUser({
    name: "Jordan Lee",
    email: "jordan@brightloop.example",
    role: "staff",
    status: "active",
    password: crypto.randomBytes(24).toString("base64url"),
  });

  const taylor = await ensureUser({
    name: "Taylor Smith",
    email: "taylor@brightloop.example",
    role: "staff",
    status: "invited",
    password: crypto.randomBytes(24).toString("base64url"),
  });

  const staffProfiles = [
    { user: admin, title: "Administrator", permissions: ["*"], status: "active", joined: "2026-01-05" },
    { user: jordan, title: "Billing manager", permissions: ["invoices:manage", "payments:read"], status: "active", joined: "2026-03-12" },
    { user: taylor, title: "Support", permissions: ["customers:read", "subscriptions:read"], status: "invited", joined: null },
  ];

  for (const profile of staffProfiles) {
    await upsertOne(
      Staff,
      { user: profile.user._id },
      {
        user: profile.user._id,
        title: profile.title,
        permissions: profile.permissions,
        status: profile.status,
        invitedBy: admin._id,
        joinedAt: profile.joined ? iso(profile.joined) : null,
        createdAt: iso("2026-01-05"),
      },
    );
  }

  // --- Taxes ----------------------------------------------------------------
  const standardTax = await upsertOne(
    Tax,
    { name: "Standard GST", country: "IN" },
    {
      name: "Standard GST",
      country: "IN",
      state: "",
      rateBasisPoints: 1800,
      inclusive: false,
      isDefault: true,
      status: "active",
      effectiveFrom: iso("2026-01-01"),
      createdBy: admin._id,
      createdAt: iso("2026-01-01"),
    },
  );

  const taxSpecs = [
    { name: "Reduced GST", rateBasisPoints: 500, state: "" },
    { name: "Zero rated", rateBasisPoints: 0, state: "" },
  ];

  for (const tax of taxSpecs) {
    await upsertOne(
      Tax,
      { name: tax.name, country: "IN" },
      {
        ...tax,
        country: "IN",
        inclusive: false,
        isDefault: false,
        status: "active",
        effectiveFrom: iso("2026-01-01"),
        createdBy: admin._id,
        createdAt: iso("2026-01-01"),
      },
    );
  }

  // --- Catalog --------------------------------------------------------------
  const products = new Map();

  for (const spec of productSpecs) {
    const product = await upsertOne(
      Product,
      { name: spec.name },
      {
        ...spec,
        createdBy: admin._id,
        createdAt: iso("2026-06-01"),
      },
    );
    products.set(product.name, product);
  }

  const plans = new Map();

  for (const spec of planSpecs) {
    const product = products.get(spec.product);
    const plan = await upsertOne(
      Plan,
      { product: product._id, name: spec.name, billingCycle: spec.billingCycle },
      {
        product: product._id,
        name: spec.name,
        billingCycle: spec.billingCycle,
        priceMinor: spec.priceMinor,
        currency: "INR",
        trialDays: spec.trialDays,
        features: spec.features,
        description: `${spec.name} plan billed ${spec.billingCycle}`,
        status: "active",
        createdBy: admin._id,
        createdAt: iso("2026-06-01"),
      },
    );
    plans.set(`${spec.product}|${spec.name}|${spec.billingCycle}`, plan);
  }

  // --- Discounts ------------------------------------------------------------
  const discountSpecs = [
    {
      code: "WELCOME10",
      type: "percentage",
      value: 10,
      duration: "once",
      status: "active",
      validFrom: "2026-07-01",
      validUntil: null,
    },
    {
      code: "ANNUAL20",
      type: "percentage",
      value: 20,
      duration: "repeating",
      durationMonths: 12,
      status: "active",
      validFrom: "2026-07-01",
      validUntil: null,
    },
    {
      code: "LAUNCH50",
      type: "fixed",
      value: 50_000,
      duration: "once",
      status: "expired",
      validFrom: "2026-07-01",
      validUntil: "2026-09-30",
    },
  ];

  for (const spec of discountSpecs) {
    await upsertOne(
      Discount,
      { code: spec.code },
      {
        ...spec,
        validFrom: iso(spec.validFrom),
        validUntil: spec.validUntil ? iso(spec.validUntil) : null,
        appliesToProducts: [products.get("Brightloop Analytics")._id],
        createdBy: admin._id,
        createdAt: iso("2026-07-01"),
      },
    );
  }

  // --- Customers ------------------------------------------------------------
  const customers = new Map();

  for (const spec of customerSpecs) {
    const customer = await upsertOne(
      Customer,
      { email: spec.email },
      {
        name: spec.name,
        email: spec.email,
        company: spec.company,
        phone: "",
        billingAddress: { city: "Bengaluru", state: "Karnataka", country: "IN" },
        gstin: "",
        currency: "INR",
        status: "active",
        notes: "Demo customer created by the seed script.",
        createdBy: admin._id,
        createdAt: iso(spec.joined),
      },
    );
    customers.set(customer.email, customer);
  }

  // --- Settings -------------------------------------------------------------
  const seededAt = new Date();
  await Settings.findOneAndUpdate(
    { key: "workspace" },
    {
      $set: {
        workspaceName: "Brightloop Software",
        currency: "INR",
        timezone: "Asia/Kolkata",
        invoicePrefix: "INV",
        invoiceDueDays: 7,
        defaultTax: standardTax._id,
        supportEmail: "billing@brightloop.example",
        updatedAt: seededAt,
      },
      $setOnInsert: { createdAt: seededAt },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, timestamps: false },
  );

  // --- Subscriptions --------------------------------------------------------
  const subscriptions = new Map();
  const keyOf = (email, [product, name, cycle]) => `${email}|${product}|${name}|${cycle}`;

  for (const spec of subscriptionSpecs) {
    const customer = customers.get(spec.email);
    const plan = plans.get(spec.plan.join("|"));

    let subscription = await Subscription.findOne({ customer: customer._id, plan: plan._id });
    if (!subscription) {
      subscription = await Subscription.create({
        customer: customer._id,
        plan: plan._id,
        status: spec.status,
        quantity: 1,
        priceMinor: plan.priceMinor,
        billingCycle: plan.billingCycle,
        billingAnchorDay: iso(spec.started).getUTCDate(),
        currency: "INR",
        taxRateBasisPoints: standardTax.rateBasisPoints,
        startedAt: iso(spec.started),
        trialEndsAt: spec.trialEnd ? iso(spec.trialEnd) : null,
        currentPeriodStart: iso(spec.periodStart),
        currentPeriodEnd: iso(spec.periodEnd),
        nextBillingAt: iso(spec.nextBilling),
        cancelAtPeriodEnd: false,
        createdBy: admin._id,
        createdAt: iso(spec.started),
        updatedAt: iso(spec.started),
      });
    }

    subscriptions.set(keyOf(spec.email, spec.plan), subscription);
  }

  // --- Invoices -------------------------------------------------------------
  const invoices = new Map();

  for (const spec of invoiceSpecs) {
    const customer = customers.get(spec.email);
    const plan = plans.get(spec.plan.join("|"));
    const subscription = subscriptions.get(keyOf(spec.email, spec.plan));
    const subtotalMinor = plan.priceMinor;
    const taxMinor = roundTax(subtotalMinor, standardTax.rateBasisPoints);

    const invoice = await upsertOne(
      Invoice,
      { invoiceNumber: spec.number },
      {
        invoiceNumber: spec.number,
        customer: customer._id,
        subscription: subscription?._id ?? null,
        items: [
          {
            description: `${plan.name} plan (${plan.billingCycle})`,
            quantity: 1,
            unitAmountMinor: subtotalMinor,
            amountMinor: subtotalMinor,
          },
        ],
        subtotalMinor,
        discountMinor: 0,
        taxMinor,
        totalMinor: subtotalMinor + taxMinor,
        currency: "INR",
        status: spec.status,
        issueDate: iso(spec.issue),
        dueDate: iso(spec.due),
        paidAt: spec.paid ? iso(spec.paid) : null,
        notes: "Demo invoice created by the seed script.",
        createdAt: iso(spec.issue),
      },
    );

    invoices.set(invoice.invoiceNumber, invoice);
  }

  // --- Payments -------------------------------------------------------------
  const payments = new Map();

  for (const spec of paymentSpecs) {
    const invoice = invoices.get(spec.invoice);
    const captured = spec.status === "captured";
    const payment = await upsertOne(
      Payment,
      { paymentNumber: spec.number },
      {
        paymentNumber: spec.number,
        invoice: invoice._id,
        customer: invoice.customer,
        subscription: invoice.subscription,
        provider: "razorpay",
        orderId: `order_demo_${spec.number}`,
        ...(captured ? { paymentId: `pay_demo_${spec.number}` } : {}),
        signatureVerified: captured,
        amountMinor: invoice.totalMinor,
        currency: "INR",
        status: spec.status,
        method: spec.method,
        failureReason: spec.failureReason ?? "",
        idempotencyKey: `seed-payment-${spec.number}`,
        paidAt: captured ? invoice.paidAt : null,
        createdAt: invoice.issueDate,
      },
    );

    payments.set(payment.paymentNumber, payment);
  }

  // --- Notifications --------------------------------------------------------
  const notificationSeeds = [
    {
      type: "payment.failed",
      title: "Payment failed for Ethan Brown",
      message: "The card was declined. A retry will be attempted on the next billing cycle.",
      entityType: "Payment",
      entityId: payments.get("PAY-882101")._id,
      createdAt: iso("2026-10-25", 11),
    },
    {
      type: "invoice.paid",
      title: "Invoice INV-2026-1048 paid",
      message: "Sophie Carter paid ₹1,768.82 for the Professional plan.",
      entityType: "Invoice",
      entityId: invoices.get("INV-2026-1048")._id,
      createdAt: iso("2026-10-28", 12),
    },
    {
      type: "subscription.created",
      title: "New subscription for Noah Williams",
      message: "Noah Williams started the Starter plan.",
      entityType: "Subscription",
      entityId: subscriptions.get("noah.w@email.com|Brightloop Analytics|Starter|monthly")._id,
      createdAt: iso("2026-10-19", 9),
    },
    {
      type: "trial.ending",
      title: "Trial ending for Ava Thompson",
      message: "The Team Workspace trial ends on 5 November 2026.",
      entityType: "Subscription",
      entityId: subscriptions.get("ava.t@email.com|Team Workspace|Team|yearly")._id,
      createdAt: iso("2026-10-30", 8),
      readAt: iso("2026-10-30", 15),
    },
    {
      type: "system",
      title: "Welcome to Brightloop",
      message: "Your workspace is ready. Seeded demo data is available for exploration.",
      entityType: "Workspace",
      entityId: null,
      createdAt: iso("2026-10-01"),
    },
  ];

  for (const notification of notificationSeeds) {
    await upsertOne(
      Notification,
      { user: admin._id, type: notification.type, entityId: notification.entityId ?? null },
      {
        user: admin._id,
        ...notification,
        metadata: {},
      },
    );
  }

  // --- Audit trail ----------------------------------------------------------
  const auditSeeds = [
    {
      action: "seed.demo_data",
      entityType: "Workspace",
      entityId: null,
      diff: { version: 1, records: subscriptionSpecs.length },
      createdAt: iso("2026-10-01"),
    },
    {
      action: "subscription.created",
      entityType: "Subscription",
      entityId: subscriptions.get("noah.w@email.com|Brightloop Analytics|Starter|monthly")._id,
      diff: { status: "active", plan: "Starter" },
      createdAt: iso("2026-10-19", 9),
    },
    {
      action: "payment.failed",
      entityType: "Payment",
      entityId: payments.get("PAY-882101")._id,
      diff: { reason: "Card declined by issuer" },
      createdAt: iso("2026-10-25", 11),
    },
  ];

  for (const entry of auditSeeds) {
    await upsertOne(
      AuditLog,
      { action: entry.action, entityType: entry.entityType, entityId: entry.entityId ?? null },
      {
        actor: admin._id,
        ...entry,
        ip: "127.0.0.1",
        userAgent: "brightloop-seed",
      },
    );
  }

  // --- Sequences ------------------------------------------------------------
  await Counter.updateOne({ _id: "invoice" }, { $max: { seq: 1048 } }, { upsert: true });
  await Counter.updateOne({ _id: "payment" }, { $max: { seq: 882104 } }, { upsert: true });

  const modelMap = {
    users: User,
    customers: Customer,
    products: Product,
    plans: Plan,
    subscriptions: Subscription,
    invoices: Invoice,
    payments: Payment,
    discounts: Discount,
    taxes: Tax,
    staff: Staff,
    notifications: Notification,
    auditLogs: AuditLog,
    settings: Settings,
    counters: Counter,
  };

  const counts = {};
  for (const [name, Model] of Object.entries(modelMap)) {
    counts[name] = await Model.countDocuments();
  }

  return {
    counts,
    adminEmail: admin.email,
    seededAt: new Date().toISOString(),
  };
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href ===
    pathToFileURL(fileURLToPath(import.meta.url)).href;

if (isDirectRun) {
  (async () => {
    await connectDB();
    const summary = await seedDatabase();
    logger.info("Seed completed", JSON.stringify(summary, null, 2));
    await disconnectDB();
  })().catch(async (error) => {
    logger.error("Seed failed", error);
    await disconnectDB().catch(() => {});
    process.exit(1);
  });
}
