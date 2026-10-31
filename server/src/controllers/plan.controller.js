import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  restorePlan,
  updatePlan,
} from "../services/plan.service.js";
import { sendCreated, sendSuccess } from "../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await listPlans(req.validated.query, req.user);
  return sendSuccess(res, { items }, { meta });
});

export const get = asyncHandler(async (req, res) => {
  const plan = await getPlan(req.params.id);
  return sendSuccess(res, { item: plan });
});

export const create = asyncHandler(async (req, res) => {
  const plan = await createPlan(req.validated.body, req.user, req);
  return sendCreated(res, { item: plan });
});

export const update = asyncHandler(async (req, res) => {
  const plan = await updatePlan(req.params.id, req.validated.body, req.user, req);
  return sendSuccess(res, { item: plan });
});

export const remove = asyncHandler(async (req, res) => {
  const plan = await deletePlan(req.params.id, req.user, req);
  return sendSuccess(res, { item: plan });
});

export const restore = asyncHandler(async (req, res) => {
  const plan = await restorePlan(req.params.id, req.user, req);
  return sendSuccess(res, { item: plan });
});
