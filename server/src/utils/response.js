/**
 * Consistent JSON envelopes for every API response.
 *
 * Success: { success: true, data, meta? }
 * Error:   { success: false, error: { code, message, details? } }
 */
export function sendSuccess(res, data = null, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

export function sendCreated(res, data, meta) {
  return sendSuccess(res, data, { status: 201, meta });
}

export function sendError(res, { status = 500, code = "INTERNAL_ERROR", message = "Something went wrong", details } = {}) {
  const body = {
    success: false,
    error: { code, message },
  };
  if (details !== undefined) body.error.details = details;
  return res.status(status).json(body);
}

export default sendSuccess;
