import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  createStaff,
  deleteStaff,
  getMyStaff,
  getStaff,
  listStaff,
  restoreStaff,
  updateStaff,
} from "../services/staff.service.js";
import { sendCreated, sendSuccess } from "../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await listStaff(req.validated.query, req.user);
  return sendSuccess(res, { items }, { meta });
});

export const me = asyncHandler(async (req, res) => {
  const staff = await getMyStaff(req.user._id);
  return sendSuccess(res, { item: staff });
});

export const get = asyncHandler(async (req, res) => {
  const staff = await getStaff(req.params.id);
  return sendSuccess(res, { item: staff });
});

export const create = asyncHandler(async (req, res) => {
  const staff = await createStaff(req.validated.body, req.user, req);
  return sendCreated(res, { item: staff });
});

export const update = asyncHandler(async (req, res) => {
  const staff = await updateStaff(req.params.id, req.validated.body, req.user, req);
  return sendSuccess(res, { item: staff });
});

export const remove = asyncHandler(async (req, res) => {
  const staff = await deleteStaff(req.params.id, req.user, req);
  return sendSuccess(res, { item: staff });
});

export const restore = asyncHandler(async (req, res) => {
  const staff = await restoreStaff(req.params.id, req.user, req);
  return sendSuccess(res, { item: staff });
});
