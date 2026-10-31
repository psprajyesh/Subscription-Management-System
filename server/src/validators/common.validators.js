import { z } from "zod";

export const objectIdSchema = z
  .string({ error: "Identifier is required" })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid identifier");

export const emailSchema = z
  .string({ error: "Email is required" })
  .trim()
  .email("Email address is invalid")
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string({ error: "Password is required" })
  .min(8, "Password must be at least 8 characters long")
  .max(128, "Password must be at most 128 characters long")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const booleanQuery = z.enum(["true", "false"]).default("false").transform((value) => value === "true");
const optionalBooleanQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

/**
 * Shared list-query contract. Resource schemas extend this with an explicit
 * sort allowlist and resource-specific filters.
 */
const listQueryObject = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.string().trim().min(1).max(40).optional(),
    order: z.enum(["asc", "desc"]).default("desc"),
    search: z
      .string()
      .trim()
      .max(200, "Search query must be at most 200 characters")
      .optional()
      .transform((value) => value || undefined),
    includeDeleted: booleanQuery,
    onlyDeleted: booleanQuery,
  })
  .strict();

function withListRefinements(schema) {
  return schema.refine((value) => !(value.includeDeleted && value.onlyDeleted), {
    message: "includeDeleted and onlyDeleted cannot both be true",
    path: ["onlyDeleted"],
  });
}

export const listQueryBase = withListRefinements(listQueryObject);

export function createListQuerySchema({ sortFields, filters = {} }) {
  return withListRefinements(
    listQueryObject
      .extend({
        sort: z.enum(sortFields).optional(),
        ...filters,
      })
      .strict(),
  );
}

export { optionalBooleanQuery, booleanQuery };
