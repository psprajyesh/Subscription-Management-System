import { AuditLog } from "../models/index.js";
import { logger } from "../utils/logger.js";

/**
 * Writes an audit entry without ever accepting passwords or tokens.
 * Audit failures must never break the calling request.
 */
export async function recordAudit({
  actor = null,
  action,
  entityType = "",
  entityId = null,
  diff = {},
  req = null,
}) {
  try {
    await AuditLog.create({
      actor: actor?._id ?? actor ?? null,
      action,
      entityType,
      entityId,
      diff,
      ip: req?.ip ?? "",
      userAgent: req?.get?.("user-agent") ?? "",
    });
  } catch (error) {
    logger.warn(`Audit log write failed for "${action}": ${error.message}`);
  }
}

export default recordAudit;
