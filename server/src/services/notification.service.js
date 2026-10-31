import { Notification, User } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import { buildListQuery, executeList } from "../utils/queryBuilder.js";
import { auditFieldNames, recordAudit } from "./audit.service.js";

const SEARCH_FIELDS = ["title", "message"];
const FILTERS = {
  type: { field: "type" },
  read: {
    field: "readAt",
    transform: (value) => (value ? { $ne: null } : null),
  },
};
const AUDIT_FIELDS = [
  "type",
  "title",
  "message",
  "entityType",
  "entityId",
  "metadata",
];

function applyNotificationFields(notification, payload) {
  for (const field of AUDIT_FIELDS) {
    if (payload[field] !== undefined) {
      notification[field] = payload[field];
    }
  }
}

export async function listNotifications(userId, query) {
  const { filter, searchCondition, sort, page, limit, skip } = buildListQuery(query, {
    searchFields: SEARCH_FIELDS,
    filters: FILTERS,
  });

  const baseFilter = { user: userId, ...filter };

  if (searchCondition) {
    Object.assign(baseFilter, searchCondition);
  }

  return executeList(Notification, { filter: baseFilter, sort, page, limit, skip });
}

export async function getNotification(userId, notificationId) {
  const notification = await Notification.findOne({
    _id: notificationId,
    user: userId,
  });

  if (!notification) {
    throw AppError.notFound("Notification not found");
  }

  return notification;
}

export async function unreadNotificationCount(userId) {
  return Notification.countDocuments({ user: userId, readAt: null });
}

export async function setNotificationRead(userId, notificationId, read) {
  const notification = await getNotification(userId, notificationId);

  if (read) {
    if (!notification.readAt) notification.readAt = new Date();
  } else {
    notification.readAt = null;
  }

  await notification.save();
  return notification;
}

export async function markAllNotificationsRead(userId) {
  const result = await Notification.updateMany(
    { user: userId, readAt: null },
    { $set: { readAt: new Date() } },
  );

  return result.modifiedCount;
}

export async function createNotification(payload, user, req) {
  const targetUser = await User.findById(payload.userId);

  if (!targetUser) {
    throw new AppError("Target user not found", {
      statusCode: 422,
      code: "INVALID_REFERENCE",
      details: { field: "userId" },
    });
  }

  const notification = new Notification({
    user: targetUser._id,
    type: payload.type,
    title: payload.title,
    message: payload.message ?? "",
    entityType: payload.entityType ?? "",
    entityId: payload.entityId ?? null,
    metadata: payload.metadata ?? {},
  });

  await notification.save();

  await recordAudit({
    actor: user,
    action: "notification.created",
    entityType: "Notification",
    entityId: notification._id,
    diff: { fields: auditFieldNames(payload), targetUser: targetUser._id },
    req,
  });

  return notification;
}

export async function updateNotification(notificationId, payload, user, req) {
  const notification = await Notification.findById(notificationId);

  if (!notification) {
    throw AppError.notFound("Notification not found");
  }

  applyNotificationFields(notification, payload);
  await notification.save();

  await recordAudit({
    actor: user,
    action: "notification.updated",
    entityType: "Notification",
    entityId: notification._id,
    diff: { fields: auditFieldNames(payload) },
    req,
  });

  return notification;
}

export async function deleteNotification(notificationId, user, req) {
  const notification = await Notification.findById(notificationId);

  if (!notification) {
    throw AppError.notFound("Notification not found");
  }

  if (!notification.user.equals(user._id) && user.role !== "admin") {
    throw AppError.notFound("Notification not found");
  }

  await notification.deleteOne();

  await recordAudit({
    actor: user,
    action: "notification.deleted",
    entityType: "Notification",
    entityId: notification._id,
    diff: { permanentlyDeleted: true },
    req,
  });
}
