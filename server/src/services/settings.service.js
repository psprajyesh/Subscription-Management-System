import { Settings, Tax } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import { auditFieldNames, recordAudit } from "./audit.service.js";

const WRITABLE_FIELDS = [
  "workspaceName",
  "currency",
  "timezone",
  "invoicePrefix",
  "invoiceDueDays",
  "defaultTax",
  "supportEmail",
];

export async function getSettings() {
  return Settings.getSingleton();
}

export async function updateSettings(payload, user, req) {
  if (payload.defaultTax !== undefined && payload.defaultTax !== null) {
    const tax = await Tax.findOne({
      _id: payload.defaultTax,
      status: "active",
    });

    if (!tax) {
      throw new AppError("Default tax must reference an active tax", {
        statusCode: 422,
        code: "INVALID_DEFAULT_TAX",
        details: { field: "defaultTax" },
      });
    }
  }

  const settings = await Settings.getSingleton();

  for (const field of WRITABLE_FIELDS) {
    if (payload[field] !== undefined) {
      settings[field] = payload[field];
    }
  }

  await settings.save();

  await recordAudit({
    actor: user,
    action: "settings.updated",
    entityType: "Settings",
    entityId: settings._id,
    diff: { fields: auditFieldNames(payload) },
    req,
  });

  return settings;
}
