import { Customer } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import {
  applySoftDeleteScope,
  buildListQuery,
  executeList,
} from "../utils/queryBuilder.js";
import { auditFieldNames, recordAudit } from "./audit.service.js";

const SEARCH_FIELDS = ["name", "email", "company", "phone"];
const FILTERS = {
  status: { field: "status" },
};
const AUDIT_FIELDS = [
  "name",
  "email",
  "phone",
  "company",
  "billingAddress",
  "gstin",
  "status",
  "notes",
];

function applyCustomerFields(customer, payload) {
  for (const field of AUDIT_FIELDS) {
    if (payload[field] === undefined) continue;

    if (field === "billingAddress") {
      Object.assign(customer.billingAddress, payload.billingAddress);
    } else {
      customer[field] = payload[field];
    }
  }
}

export async function listCustomers(query, user) {
  const { filter, searchCondition, sort, page, limit, skip } = buildListQuery(query, {
    searchFields: SEARCH_FIELDS,
    filters: FILTERS,
  });

  const baseFilter = searchCondition ? { ...filter, ...searchCondition } : filter;
  const scoped = applySoftDeleteScope({ filter: baseFilter, query, user });

  return executeList(Customer, { ...scoped, sort, page, limit, skip });
}

export async function getCustomer(customerId) {
  const customer = await Customer.findById(customerId);

  if (!customer) {
    throw AppError.notFound("Customer not found");
  }

  return customer;
}

export async function createCustomer(payload, user, req) {
  const customer = new Customer();
  applyCustomerFields(customer, payload);
  customer.createdBy = user._id;

  await customer.save();

  await recordAudit({
    actor: user,
    action: "customer.created",
    entityType: "Customer",
    entityId: customer._id,
    diff: { fields: auditFieldNames(payload) },
    req,
  });

  return customer;
}

export async function updateCustomer(customerId, payload, user, req) {
  const customer = await getCustomer(customerId);
  applyCustomerFields(customer, payload);

  await customer.save();

  await recordAudit({
    actor: user,
    action: "customer.updated",
    entityType: "Customer",
    entityId: customer._id,
    diff: { fields: auditFieldNames(payload) },
    req,
  });

  return customer;
}

export async function deleteCustomer(customerId, user, req) {
  const customer = await getCustomer(customerId);

  await customer.softDelete(user._id);

  await recordAudit({
    actor: user,
    action: "customer.deleted",
    entityType: "Customer",
    entityId: customer._id,
    diff: { softDeleted: true },
    req,
  });

  return customer;
}

export async function restoreCustomer(customerId, user, req) {
  const customer = await Customer.findOne({ _id: customerId }).setOptions({
    withDeleted: true,
  });

  if (!customer) {
    throw AppError.notFound("Customer not found");
  }

  if (!customer.deletedAt) {
    throw new AppError("Customer is not deleted", {
      statusCode: 409,
      code: "NOT_DELETED",
    });
  }

  await customer.restore();

  await recordAudit({
    actor: user,
    action: "customer.restored",
    entityType: "Customer",
    entityId: customer._id,
    diff: { restored: true },
    req,
  });

  return customer;
}
