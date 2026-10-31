import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  createDiscount,
  deleteDiscount,
  getDiscount,
  listDiscounts,
  restoreDiscount,
  updateDiscount,
} from "../services/discount.service.js";
import { sendCreated, sendSuccess } from "../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await listDiscounts(req.validated.query, req.user);
  return sendSuccess(res, { items }, { meta });
});

export const get = asyncHandler(async (req, res) => {
  const discount = await getDiscount(req.params.id);
  return sendSuccess(res, { item: discount });
});

export const create = asyncHandler(async (req, res) => {
  const discount = await createDiscount(req.validated.body, req.user, req);
  return sendCreated(res, { item: discount });
});

export const update = asyncHandler(async (req, res) => {
  const discount = await updateDiscount(
    req.params.id,
    req.validated.body,
    req.user,
    req,
  );
  return sendSuccess(res, { item: discount });
});

export const remove = asyncHandler(async (req, res) => {
  const discount = await deleteDiscount(req.params.id, req.user, req);
  return sendSuccess(res, { item: discount });
});

export const restore = asyncHandler(async (req, res) => {
  const discount = await restoreDiscount(req.params.id, req.user, req);
  return sendSuccess(res, { item: discount });
});
