import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  createNotification,
  deleteNotification,
  getNotification,
  listNotifications,
  markAllNotificationsRead,
  setNotificationRead,
  unreadNotificationCount,
  updateNotification,
} from "../services/notification.service.js";
import { sendCreated, sendSuccess } from "../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await listNotifications(req.user._id, req.validated.query);
  return sendSuccess(res, { items }, { meta });
});

export const unreadCount = asyncHandler(async (req, res) => {
  const count = await unreadNotificationCount(req.user._id);
  return sendSuccess(res, { count });
});

export const get = asyncHandler(async (req, res) => {
  const notification = await getNotification(req.user._id, req.params.id);
  return sendSuccess(res, { item: notification });
});

export const create = asyncHandler(async (req, res) => {
  const notification = await createNotification(req.validated.body, req.user, req);
  return sendCreated(res, { item: notification });
});

export const update = asyncHandler(async (req, res) => {
  const notification = await updateNotification(
    req.params.id,
    req.validated.body,
    req.user,
    req,
  );
  return sendSuccess(res, { item: notification });
});

export const markRead = asyncHandler(async (req, res) => {
  const notification = await setNotificationRead(req.user._id, req.params.id, true);
  return sendSuccess(res, { item: notification });
});

export const markUnread = asyncHandler(async (req, res) => {
  const notification = await setNotificationRead(req.user._id, req.params.id, false);
  return sendSuccess(res, { item: notification });
});

export const markAllRead = asyncHandler(async (req, res) => {
  const updated = await markAllNotificationsRead(req.user._id);
  return sendSuccess(res, { updated });
});

export const remove = asyncHandler(async (req, res) => {
  await deleteNotification(req.params.id, req.user, req);
  return sendSuccess(res, { message: "Notification deleted" });
});
