import { Plan, Product } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import {
  applySoftDeleteScope,
  buildListQuery,
  executeList,
} from "../utils/queryBuilder.js";
import { auditFieldNames, recordAudit } from "./audit.service.js";

const SEARCH_FIELDS = ["name", "description"];
const FILTERS = {
  product: { field: "product" },
  billingCycle: { field: "billingCycle" },
  status: { field: "status" },
};
const AUDIT_FIELDS = [
  "product",
  "name",
  "description",
  "billingCycle",
  "priceMinor",
  "trialDays",
  "features",
  "status",
];

async function assertProductExists(productId) {
  const product = await Product.findById(productId);

  if (!product) {
    throw new AppError("Product not found", {
      statusCode: 422,
      code: "INVALID_REFERENCE",
      details: { field: "product" },
    });
  }
}

function applyPlanFields(plan, payload) {
  for (const field of AUDIT_FIELDS) {
    if (payload[field] !== undefined) {
      plan[field] = payload[field];
    }
  }
}

export async function listPlans(query, user) {
  const { filter, searchCondition, sort, page, limit, skip } = buildListQuery(query, {
    searchFields: SEARCH_FIELDS,
    filters: FILTERS,
  });

  const baseFilter = searchCondition ? { ...filter, ...searchCondition } : filter;
  const scoped = applySoftDeleteScope({ filter: baseFilter, query, user });

  return executeList(Plan, { ...scoped, sort, page, limit, skip });
}

export async function getPlan(planId) {
  const plan = await Plan.findById(planId);

  if (!plan) {
    throw AppError.notFound("Plan not found");
  }

  return plan;
}

export async function createPlan(payload, user, req) {
  await assertProductExists(payload.product);

  const plan = new Plan();
  applyPlanFields(plan, payload);
  plan.createdBy = user._id;

  await plan.save();

  await recordAudit({
    actor: user,
    action: "plan.created",
    entityType: "Plan",
    entityId: plan._id,
    diff: { fields: auditFieldNames(payload) },
    req,
  });

  return plan;
}

export async function updatePlan(planId, payload, user, req) {
  const plan = await getPlan(planId);

  if (payload.product !== undefined) {
    await assertProductExists(payload.product);
  }

  applyPlanFields(plan, payload);

  await plan.save();

  await recordAudit({
    actor: user,
    action: "plan.updated",
    entityType: "Plan",
    entityId: plan._id,
    diff: { fields: auditFieldNames(payload) },
    req,
  });

  return plan;
}

export async function deletePlan(planId, user, req) {
  const plan = await getPlan(planId);

  await plan.softDelete(user._id);

  await recordAudit({
    actor: user,
    action: "plan.deleted",
    entityType: "Plan",
    entityId: plan._id,
    diff: { softDeleted: true },
    req,
  });

  return plan;
}

export async function restorePlan(planId, user, req) {
  const plan = await Plan.findOne({ _id: planId }).setOptions({ withDeleted: true });

  if (!plan) {
    throw AppError.notFound("Plan not found");
  }

  if (!plan.deletedAt) {
    throw new AppError("Plan is not deleted", {
      statusCode: 409,
      code: "NOT_DELETED",
    });
  }

  await plan.restore();

  await recordAudit({
    actor: user,
    action: "plan.restored",
    entityType: "Plan",
    entityId: plan._id,
    diff: { restored: true },
    req,
  });

  return plan;
}
