/**
 * Validates request input with a Zod schema and exposes the parsed value via
 * `req.validated[source]`. Express 5 makes `req.query` read-only, so controllers
 * should prefer `req.validated.query` over mutating the request.
 */
export function validate(schema, source = "body") {
  return function validateRequest(req, _res, next) {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return next(result.error);
    }

    if (source === "body") {
      req.body = result.data;
    }

    req.validated = {
      ...(req.validated || {}),
      [source]: result.data,
    };

    return next();
  };
}

export default validate;
