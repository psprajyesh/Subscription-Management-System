import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  createTax,
  deleteTax,
  getTax,
  listTaxes,
  restoreTax,
  updateTax,
} from "../services/tax.service.js";
import { sendCreated, sendSuccess } from "../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await listTaxes(req.validated.query, req.user);
  return sendSuccess(res, { items }, { meta });
});

export const get = asyncHandler(async (req, res) => {
  const tax = await getTax(req.params.id);
  return sendSuccess(res, { item: tax });
});

export const create = asyncHandler(async (req, res) => {
  const tax = await createTax(req.validated.body, req.user, req);
  return sendCreated(res, { item: tax });
});

export const update = asyncHandler(async (req, res) => {
  const tax = await updateTax(req.params.id, req.validated.body, req.user, req);
  return sendSuccess(res, { item: tax });
});

export const remove = asyncHandler(async (req, res) => {
  const tax = await deleteTax(req.params.id, req.user, req);
  return sendSuccess(res, { item: tax });
});

export const restore = asyncHandler(async (req, res) => {
  const tax = await restoreTax(req.params.id, req.user, req);
  return sendSuccess(res, { item: tax });
});
