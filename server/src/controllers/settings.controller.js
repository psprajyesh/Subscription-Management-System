import { asyncHandler } from "../middleware/asyncHandler.js";
import { getSettings, updateSettings } from "../services/settings.service.js";
import { sendSuccess } from "../utils/response.js";

export const get = asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  return sendSuccess(res, { item: settings });
});

export const update = asyncHandler(async (req, res) => {
  const settings = await updateSettings(req.validated.body, req.user, req);
  return sendSuccess(res, { item: settings });
});
