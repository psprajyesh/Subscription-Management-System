import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  restoreCustomer,
  updateCustomer,
} from "../services/customer.service.js";
import { sendCreated, sendSuccess } from "../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await listCustomers(req.validated.query, req.user);
  return sendSuccess(res, { items }, { meta });
});

export const get = asyncHandler(async (req, res) => {
  const customer = await getCustomer(req.params.id);
  return sendSuccess(res, { item: customer });
});

export const create = asyncHandler(async (req, res) => {
  const customer = await createCustomer(req.validated.body, req.user, req);
  return sendCreated(res, { item: customer });
});

export const update = asyncHandler(async (req, res) => {
  const customer = await updateCustomer(
    req.params.id,
    req.validated.body,
    req.user,
    req,
  );
  return sendSuccess(res, { item: customer });
});

export const remove = asyncHandler(async (req, res) => {
  const customer = await deleteCustomer(req.params.id, req.user, req);
  return sendSuccess(res, { item: customer });
});

export const restore = asyncHandler(async (req, res) => {
  const customer = await restoreCustomer(req.params.id, req.user, req);
  return sendSuccess(res, { item: customer });
});
