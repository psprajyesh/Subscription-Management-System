import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  restoreProduct,
  updateProduct,
} from "../services/product.service.js";
import { sendCreated, sendSuccess } from "../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await listProducts(req.validated.query, req.user);
  return sendSuccess(res, { items }, { meta });
});

export const get = asyncHandler(async (req, res) => {
  const product = await getProduct(req.params.id);
  return sendSuccess(res, { item: product });
});

export const create = asyncHandler(async (req, res) => {
  const product = await createProduct(req.validated.body, req.user, req);
  return sendCreated(res, { item: product });
});

export const update = asyncHandler(async (req, res) => {
  const product = await updateProduct(req.params.id, req.validated.body, req.user, req);
  return sendSuccess(res, { item: product });
});

export const remove = asyncHandler(async (req, res) => {
  const product = await deleteProduct(req.params.id, req.user, req);
  return sendSuccess(res, { item: product });
});

export const restore = asyncHandler(async (req, res) => {
  const product = await restoreProduct(req.params.id, req.user, req);
  return sendSuccess(res, { item: product });
});
