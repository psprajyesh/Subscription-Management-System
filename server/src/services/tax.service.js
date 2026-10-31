import { Settings, Tax } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import {
  applySoftDeleteScope,
  buildListQuery,
  executeList,
} from "../utils/queryBuilder.js";
import { auditFieldNames, recordAudit } from "./audit.service.js";

const SEARCH_FIELDS = ["name", "state", "country"];
const FILTERS = {
  status: { field: "status" },
  country: { field: "country" },
  isDefault: { field: "isDefault" },
};
const AUDIT_FIELDS = [
  "name",
  "country",
  "state",
  "rateBasisPoints",
  "inclusive",
  "isDefault",
  "status",
  "effectiveFrom",
];

async function clearOtherDefaults(excludeId = null) {
  const filter = { isDefault: true, deletedAt: null };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  await Tax.updateMany(filter, { $set: { isDefault: false } });
}

function applyTaxFields(tax, payload) {
  for (const field of AUDIT_FIELDS) {
    if (payload[field] !== undefined) {
      tax[field] = payload[field];
    }
  }
}

export async function listTaxes(query, user) {
  const { filter, searchCondition, sort, page, limit, skip } = buildListQuery(query, {
    searchFields: SEARCH_FIELDS,
    filters: FILTERS,
  });

  const baseFilter = searchCondition ? { ...filter, ...searchCondition } : filter;
  const scoped = applySoftDeleteScope({ filter: baseFilter, query, user });

  return executeList(Tax, { ...scoped, sort, page, limit, skip });
}

export async function getTax(taxId) {
  const tax = await Tax.findById(taxId);

  if (!tax) {
    throw AppError.notFound("Tax not found");
  }

  return tax;
}

export async function createTax(payload, user, req) {
  if (payload.isDefault) {
    await clearOtherDefaults();
  }

  const tax = new Tax();
  applyTaxFields(tax, payload);
  tax.createdBy = user._id;

  if (payload.effectiveFrom === undefined) tax.effectiveFrom = new Date();

  await tax.save();

  await recordAudit({
    actor: user,
    action: "tax.created",
    entityType: "Tax",
    entityId: tax._id,
    diff: { fields: auditFieldNames(payload) },
    req,
  });

  return tax;
}

export async function updateTax(taxId, payload, user, req) {
  const tax = await getTax(taxId);

  if (payload.isDefault === true) {
    await clearOtherDefaults(tax._id);
  }

  applyTaxFields(tax, payload);

  await tax.save();

  await recordAudit({
    actor: user,
    action: "tax.updated",
    entityType: "Tax",
    entityId: tax._id,
    diff: { fields: auditFieldNames(payload) },
    req,
  });

  return tax;
}

export async function deleteTax(taxId, user, req) {
  const tax = await getTax(taxId);

  await Settings.updateOne({ defaultTax: tax._id }, { $set: { defaultTax: null } });
  await tax.softDelete(user._id);

  await recordAudit({
    actor: user,
    action: "tax.deleted",
    entityType: "Tax",
    entityId: tax._id,
    diff: { softDeleted: true, clearedDefaultSetting: true },
    req,
  });

  return tax;
}

export async function restoreTax(taxId, user, req) {
  const tax = await Tax.findOne({ _id: taxId }).setOptions({ withDeleted: true });

  if (!tax) {
    throw AppError.notFound("Tax not found");
  }

  if (!tax.deletedAt) {
    throw new AppError("Tax is not deleted", {
      statusCode: 409,
      code: "NOT_DELETED",
    });
  }

  if (tax.isDefault) {
    const existingDefault = await Tax.findOne({ isDefault: true, _id: { $ne: tax._id } });

    if (existingDefault) {
      throw new AppError("Another default tax exists. Disable it before restoring this tax.", {
        statusCode: 409,
        code: "DEFAULT_TAX_EXISTS",
      });
    }
  }

  await tax.restore();

  await recordAudit({
    actor: user,
    action: "tax.restored",
    entityType: "Tax",
    entityId: tax._id,
    diff: { restored: true },
    req,
  });

  return tax;
}
