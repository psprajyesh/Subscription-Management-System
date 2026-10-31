import { Discount, Plan, Product } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import {
  applySoftDeleteScope,
  buildListQuery,
  executeList,
} from "../utils/queryBuilder.js";
import { auditFieldNames, recordAudit } from "./audit.service.js";

const SEARCH_FIELDS = ["code"];
const FILTERS = {
  type: { field: "type" },
  status: { field: "status" },
};
const AUDIT_FIELDS = [
  "code",
  "type",
  "value",
  "duration",
  "durationMonths",
  "maxRedemptions",
  "minAmountMinor",
  "appliesToProducts",
  "appliesToPlans",
  "validFrom",
  "validUntil",
  "status",
];

async function assertReferences(payload) {
  if (payload.appliesToProducts !== undefined) {
    const uniqueIds = [...new Set(payload.appliesToProducts)];
    const count = await Product.countDocuments({ _id: { $in: uniqueIds } });

    if (count !== uniqueIds.length) {
      throw new AppError("One or more products were not found", {
        statusCode: 422,
        code: "INVALID_REFERENCE",
        details: { field: "appliesToProducts" },
      });
    }
  }

  if (payload.appliesToPlans !== undefined) {
    const uniqueIds = [...new Set(payload.appliesToPlans)];
    const count = await Plan.countDocuments({ _id: { $in: uniqueIds } });

    if (count !== uniqueIds.length) {
      throw new AppError("One or more plans were not found", {
        statusCode: 422,
        code: "INVALID_REFERENCE",
        details: { field: "appliesToPlans" },
      });
    }
  }
}

function applyDiscountFields(discount, payload) {
  for (const field of AUDIT_FIELDS) {
    if (payload[field] !== undefined) {
      discount[field] = payload[field];
    }
  }
}

export async function listDiscounts(query, user) {
  const { filter, searchCondition, sort, page, limit, skip } = buildListQuery(query, {
    searchFields: SEARCH_FIELDS,
    filters: FILTERS,
  });

  const baseFilter = searchCondition ? { ...filter, ...searchCondition } : filter;
  const scoped = applySoftDeleteScope({ filter: baseFilter, query, user });

  return executeList(Discount, { ...scoped, sort, page, limit, skip });
}

export async function getDiscount(discountId) {
  const discount = await Discount.findById(discountId);

  if (!discount) {
    throw AppError.notFound("Discount not found");
  }

  return discount;
}

export async function createDiscount(payload, user, req) {
  await assertReferences(payload);

  const discount = new Discount();
  applyDiscountFields(discount, payload);

  if (payload.validFrom === undefined) discount.validFrom = new Date();
  if (payload.validUntil === undefined) discount.validUntil = null;
  discount.createdBy = user._id;

  await discount.save();

  await recordAudit({
    actor: user,
    action: "discount.created",
    entityType: "Discount",
    entityId: discount._id,
    diff: { fields: auditFieldNames(payload) },
    req,
  });

  return discount;
}

export async function updateDiscount(discountId, payload, user, req) {
  const discount = await getDiscount(discountId);

  await assertReferences(payload);
  applyDiscountFields(discount, payload);

  await discount.save();

  await recordAudit({
    actor: user,
    action: "discount.updated",
    entityType: "Discount",
    entityId: discount._id,
    diff: { fields: auditFieldNames(payload) },
    req,
  });

  return discount;
}

export async function deleteDiscount(discountId, user, req) {
  const discount = await getDiscount(discountId);

  await discount.softDelete(user._id);

  await recordAudit({
    actor: user,
    action: "discount.deleted",
    entityType: "Discount",
    entityId: discount._id,
    diff: { softDeleted: true },
    req,
  });

  return discount;
}

export async function restoreDiscount(discountId, user, req) {
  const discount = await Discount.findOne({ _id: discountId }).setOptions({
    withDeleted: true,
  });

  if (!discount) {
    throw AppError.notFound("Discount not found");
  }

  if (!discount.deletedAt) {
    throw new AppError("Discount is not deleted", {
      statusCode: 409,
      code: "NOT_DELETED",
    });
  }

  await discount.restore();

  await recordAudit({
    actor: user,
    action: "discount.restored",
    entityType: "Discount",
    entityId: discount._id,
    diff: { restored: true },
    req,
  });

  return discount;
}
