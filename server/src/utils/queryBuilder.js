import { AppError } from "./AppError.js";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Escapes user-supplied text before it is used in a MongoDB regex. This keeps
 * search terms literal and prevents catastrophic backtracking (ReDoS).
 */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildSearchCondition(search, fields) {
  if (!search || fields.length === 0) return null;

  const pattern = escapeRegex(search);
  return {
    $or: fields.map((field) => ({
      [field]: { $regex: pattern, $options: "i" },
    })),
  };
}

export function buildListQuery(
  query,
  { searchFields = [], filters = {}, defaultSort = "createdAt" } = {},
) {
  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const sortField = query.sort ?? defaultSort;
  const order = query.order === "asc" ? 1 : -1;

  const filter = {};

  for (const [key, definition] of Object.entries(filters)) {
    const value = query[key];

    if (value === undefined) continue;

    const field = definition.field ?? key;
    filter[field] = definition.transform ? definition.transform(value) : value;
  }

  return {
    filter,
    searchCondition: buildSearchCondition(query.search, searchFields),
    sort: { [sortField]: order },
    page,
    limit,
    skip: (page - 1) * limit,
    search: query.search,
  };
}

/**
 * Applies soft-delete visibility. Deleted records stay hidden by default.
 * Only administrators may request deleted records.
 */
export function applySoftDeleteScope({ filter, query, user }) {
  const includeDeleted = Boolean(query.includeDeleted);
  const onlyDeleted = Boolean(query.onlyDeleted);

  if ((includeDeleted || onlyDeleted) && user?.role !== "admin") {
    throw AppError.forbidden("Only administrators can view deleted records");
  }

  if (onlyDeleted) {
    return {
      filter: { ...filter, deletedAt: { $ne: null } },
      withDeleted: true,
    };
  }

  return { filter, withDeleted: includeDeleted };
}

export async function executeList(
  Model,
  { filter, sort, skip, limit, page, withDeleted = false, populate, select },
) {
  const findQuery = Model.find(filter).sort(sort).skip(skip).limit(limit);
  const countQuery = Model.countDocuments(filter);

  if (withDeleted) {
    findQuery.setOptions({ withDeleted: true });
    countQuery.setOptions({ withDeleted: true });
  }

  if (select) findQuery.select(select);
  if (populate) findQuery.populate(populate);

  const [items, total] = await Promise.all([findQuery.exec(), countQuery.exec()]);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}
