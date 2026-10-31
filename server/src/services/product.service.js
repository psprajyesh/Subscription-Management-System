import { Product } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import {
  applySoftDeleteScope,
  buildListQuery,
  executeList,
} from "../utils/queryBuilder.js";
import { auditFieldNames, recordAudit } from "./audit.service.js";

const SEARCH_FIELDS = ["name", "description"];
const FILTERS = {
  status: { field: "status" },
};
const AUDIT_FIELDS = ["name", "description", "status"];

function applyProductFields(product, payload) {
  for (const field of AUDIT_FIELDS) {
    if (payload[field] !== undefined) {
      product[field] = payload[field];
    }
  }
}

export async function listProducts(query, user) {
  const { filter, searchCondition, sort, page, limit, skip } = buildListQuery(query, {
    searchFields: SEARCH_FIELDS,
    filters: FILTERS,
  });

  const baseFilter = searchCondition ? { ...filter, ...searchCondition } : filter;
  const scoped = applySoftDeleteScope({ filter: baseFilter, query, user });

  return executeList(Product, { ...scoped, sort, page, limit, skip });
}

export async function getProduct(productId) {
  const product = await Product.findById(productId);

  if (!product) {
    throw AppError.notFound("Product not found");
  }

  return product;
}

export async function createProduct(payload, user, req) {
  const product = new Product();
  applyProductFields(product, payload);
  product.createdBy = user._id;

  await product.save();

  await recordAudit({
    actor: user,
    action: "product.created",
    entityType: "Product",
    entityId: product._id,
    diff: { fields: auditFieldNames(payload) },
    req,
  });

  return product;
}

export async function updateProduct(productId, payload, user, req) {
  const product = await getProduct(productId);
  applyProductFields(product, payload);

  await product.save();

  await recordAudit({
    actor: user,
    action: "product.updated",
    entityType: "Product",
    entityId: product._id,
    diff: { fields: auditFieldNames(payload) },
    req,
  });

  return product;
}

export async function deleteProduct(productId, user, req) {
  const product = await getProduct(productId);

  await product.softDelete(user._id);

  await recordAudit({
    actor: user,
    action: "product.deleted",
    entityType: "Product",
    entityId: product._id,
    diff: { softDeleted: true },
    req,
  });

  return product;
}

export async function restoreProduct(productId, user, req) {
  const product = await Product.findOne({ _id: productId }).setOptions({
    withDeleted: true,
  });

  if (!product) {
    throw AppError.notFound("Product not found");
  }

  if (!product.deletedAt) {
    throw new AppError("Product is not deleted", {
      statusCode: 409,
      code: "NOT_DELETED",
    });
  }

  await product.restore();

  await recordAudit({
    actor: user,
    action: "product.restored",
    entityType: "Product",
    entityId: product._id,
    diff: { restored: true },
    req,
  });

  return product;
}
