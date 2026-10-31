import { Staff, User } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import {
  applySoftDeleteScope,
  buildListQuery,
  escapeRegex,
  executeList,
} from "../utils/queryBuilder.js";
import { invalidateUserSessions } from "./auth.service.js";
import { auditFieldNames, recordAudit } from "./audit.service.js";

const SAFE_USER_FIELDS = "name email role status lastLoginAt createdAt updatedAt";
const POPULATE_USER = { path: "user", select: SAFE_USER_FIELDS };
const FILTERS = {
  status: { field: "status" },
};

function mapUserStatus(staffStatus) {
  if (staffStatus === "active") return "active";
  if (staffStatus === "invited") return "invited";
  return "suspended";
}

async function populateStaff(staff) {
  await staff.populate(POPULATE_USER);
  return staff;
}

async function assertCanDeactivate(user, actorId) {
  if (user._id.equals(actorId)) {
    throw new AppError("You cannot deactivate your own account", {
      statusCode: 409,
      code: "CANNOT_DEACTIVATE_SELF",
    });
  }

  if (user.role === "admin" && user.status === "active") {
    const activeAdmins = await User.countDocuments({ role: "admin", status: "active" });

    if (activeAdmins <= 1) {
      throw new AppError("The last active administrator cannot be deactivated", {
        statusCode: 409,
        code: "LAST_ADMIN",
      });
    }
  }
}

export async function listStaff(query, user) {
  const { filter, sort, page, limit, skip } = buildListQuery(query, {
    filters: FILTERS,
  });

  let baseFilter = filter;

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), "i");
    const matchingUsers = await User.find({
      $or: [{ name: pattern }, { email: pattern }],
    })
      .select("_id")
      .limit(1000);

    baseFilter = {
      ...filter,
      $or: [
        { title: pattern },
        { phone: pattern },
        { user: { $in: matchingUsers.map((entry) => entry._id) } },
      ],
    };
  }

  const scoped = applySoftDeleteScope({ filter: baseFilter, query, user });

  return executeList(Staff, {
    ...scoped,
    sort,
    page,
    limit,
    skip,
    populate: POPULATE_USER,
  });
}

export async function getStaff(staffId) {
  const staff = await Staff.findById(staffId).populate(POPULATE_USER);

  if (!staff) {
    throw AppError.notFound("Staff member not found");
  }

  return staff;
}

export async function getMyStaff(userId) {
  const staff = await Staff.findOne({ user: userId }).populate(POPULATE_USER);

  if (!staff) {
    throw AppError.notFound("Staff profile not found");
  }

  return staff;
}

export async function createStaff(payload, user, req) {
  const existingUser = await User.findOne({ email: payload.email });

  if (existingUser) {
    throw AppError.conflict("A user with this email already exists");
  }

  const status = payload.status ?? "invited";
  const staffUser = new User({
    name: payload.name,
    email: payload.email,
    role: "staff",
    status: mapUserStatus(status),
  });

  await staffUser.setPassword(payload.password);
  await staffUser.save();

  let staff;

  try {
    staff = new Staff({
      user: staffUser._id,
      title: payload.title,
      phone: payload.phone,
      permissions: payload.permissions,
      status,
      invitedBy: user._id,
      joinedAt: status === "active" ? new Date() : null,
    });

    await staff.save();
  } catch (error) {
    // Avoid orphaning a login account if the profile insert fails.
    await User.deleteOne({ _id: staffUser._id }).catch(() => {});
    throw error;
  }

  await populateStaff(staff);

  await recordAudit({
    actor: user,
    action: "staff.created",
    entityType: "Staff",
    entityId: staff._id,
    diff: { fields: auditFieldNames(payload, ["password"]) },
    req,
  });

  return staff;
}

export async function updateStaff(staffId, payload, user, req) {
  const staff = await Staff.findById(staffId);

  if (!staff) {
    throw AppError.notFound("Staff member not found");
  }

  const staffUser = await User.findById(staff.user);

  if (!staffUser) {
    throw AppError.notFound("Staff account not found");
  }

  if (payload.status !== undefined && payload.status !== "active") {
    await assertCanDeactivate(staffUser, user._id);
  }

  if (payload.name !== undefined) staffUser.name = payload.name;
  if (payload.email !== undefined) staffUser.email = payload.email;
  if (payload.status !== undefined) staffUser.status = mapUserStatus(payload.status);
  if (payload.password !== undefined) await staffUser.setPassword(payload.password);

  await staffUser.save();

  if (payload.password !== undefined || (payload.status !== undefined && payload.status !== "active")) {
    await invalidateUserSessions(
      staffUser._id,
      payload.password !== undefined ? "password_change" : "account_inactive",
    );
  }

  if (payload.title !== undefined) staff.title = payload.title;
  if (payload.phone !== undefined) staff.phone = payload.phone;
  if (payload.permissions !== undefined) staff.permissions = payload.permissions;
  if (payload.status !== undefined) staff.status = payload.status;

  if (staff.status === "active" && !staff.joinedAt) {
    staff.joinedAt = new Date();
  }

  await staff.save();
  await populateStaff(staff);

  await recordAudit({
    actor: user,
    action: "staff.updated",
    entityType: "Staff",
    entityId: staff._id,
    diff: {
      fields: auditFieldNames(payload, ["password"]),
      passwordReset: payload.password !== undefined,
    },
    req,
  });

  return staff;
}

export async function deleteStaff(staffId, user, req) {
  const staff = await Staff.findById(staffId);

  if (!staff) {
    throw AppError.notFound("Staff member not found");
  }

  const staffUser = await User.findById(staff.user);

  if (staffUser?._id.equals(user._id)) {
    throw new AppError("You cannot delete your own staff profile", {
      statusCode: 409,
      code: "CANNOT_DELETE_SELF",
    });
  }

  if (staffUser) {
    await assertCanDeactivate(staffUser, user._id);
  }

  await staff.softDelete(user._id);

  if (staffUser) {
    staffUser.status = "suspended";
    await staffUser.save();
    await invalidateUserSessions(staffUser._id, "account_inactive");
  }

  await recordAudit({
    actor: user,
    action: "staff.deleted",
    entityType: "Staff",
    entityId: staff._id,
    diff: { softDeleted: true, accountSuspended: Boolean(staffUser) },
    req,
  });

  return staff;
}

export async function restoreStaff(staffId, user, req) {
  const staff = await Staff.findOne({ _id: staffId }).setOptions({ withDeleted: true });

  if (!staff) {
    throw AppError.notFound("Staff member not found");
  }

  if (!staff.deletedAt) {
    throw new AppError("Staff member is not deleted", {
      statusCode: 409,
      code: "NOT_DELETED",
    });
  }

  const staffUser = await User.findById(staff.user);

  if (!staffUser) {
    throw new AppError("Cannot restore staff without an account", {
      statusCode: 409,
      code: "ACCOUNT_MISSING",
    });
  }

  await staff.restore();

  staffUser.status = mapUserStatus(staff.status);
  await staffUser.save();

  if (staffUser.status !== "active") {
    await invalidateUserSessions(staffUser._id, "account_inactive");
  }

  await populateStaff(staff);

  await recordAudit({
    actor: user,
    action: "staff.restored",
    entityType: "Staff",
    entityId: staff._id,
    diff: { restored: true },
    req,
  });

  return staff;
}
