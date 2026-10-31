import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  activateTrial,
  cancelSubscription,
  changeSubscriptionPlan,
  createSubscription,
  expireSubscription,
  getSubscription,
  listSubscriptions,
  markSubscriptionPastDue,
  pauseSubscription,
  reactivateSubscription,
  renewSubscription,
  resumeSubscription,
} from "../services/subscription.service.js";
import { getSubscriptionMetrics } from "../services/subscriptionMetrics.service.js";
import { sendCreated, sendSuccess } from "../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await listSubscriptions(req.validated.query, req.user);
  return sendSuccess(res, { items }, { meta });
});

export const listPastDue = asyncHandler(async (req, res) => {
  const { items, meta } = await listSubscriptions(
    { ...req.validated.query, status: "past_due" },
    req.user,
  );
  return sendSuccess(res, { items }, { meta });
});

export const metrics = asyncHandler(async (req, res) => {
  const result = await getSubscriptionMetrics(req.validated.query);
  return sendSuccess(res, result);
});

export const get = asyncHandler(async (req, res) => {
  const subscription = await getSubscription(req.params.id);
  return sendSuccess(res, { item: subscription });
});

export const create = asyncHandler(async (req, res) => {
  const subscription = await createSubscription(
    req.validated.body,
    req.user,
    req,
  );
  return sendCreated(res, { item: subscription });
});

export const trialActivate = asyncHandler(async (req, res) => {
  const subscription = await activateTrial(req.params.id, req.user, req);
  return sendSuccess(res, { item: subscription });
});

export const pause = asyncHandler(async (req, res) => {
  const subscription = await pauseSubscription(req.params.id, req.user, req);
  return sendSuccess(res, { item: subscription });
});

export const resume = asyncHandler(async (req, res) => {
  const subscription = await resumeSubscription(req.params.id, req.user, req);
  return sendSuccess(res, { item: subscription });
});

export const cancel = asyncHandler(async (req, res) => {
  const subscription = await cancelSubscription(
    req.params.id,
    req.validated.body,
    req.user,
    req,
  );
  return sendSuccess(res, { item: subscription });
});

export const renew = asyncHandler(async (req, res) => {
  const result = await renewSubscription(req.params.id, {
    actor: req.user,
    req,
  });

  return sendSuccess(res, {
    item: result.subscription,
    invoice: result.invoice,
    renewal: { renewed: result.renewed, reason: result.reason ?? null },
  });
});

export const expire = asyncHandler(async (req, res) => {
  const subscription = await expireSubscription(req.params.id, req.user, req);
  return sendSuccess(res, { item: subscription });
});

export const pastDue = asyncHandler(async (req, res) => {
  const subscription = await markSubscriptionPastDue(
    req.params.id,
    req.user,
    req,
  );
  return sendSuccess(res, { item: subscription });
});

export const reactivate = asyncHandler(async (req, res) => {
  const subscription = await reactivateSubscription(
    req.params.id,
    req.user,
    req,
  );
  return sendSuccess(res, { item: subscription });
});

export const upgrade = asyncHandler(async (req, res) => {
  const result = await changeSubscriptionPlan(
    req.params.id,
    req.validated.body,
    "upgrade",
    req.user,
    req,
  );
  return sendSuccess(res, { item: result.subscription, proration: result.proration });
});

export const downgrade = asyncHandler(async (req, res) => {
  const result = await changeSubscriptionPlan(
    req.params.id,
    req.validated.body,
    "downgrade",
    req.user,
    req,
  );
  return sendSuccess(res, { item: result.subscription, proration: result.proration });
});
