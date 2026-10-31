import { Router } from "express";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

const router = Router();

const connectionStates = ["disconnected", "connected", "connecting", "disconnecting"];

/**
 * GET /api/health
 * Lightweight liveness probe consumed by the frontend/dev tooling.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    sendSuccess(res, {
      status: "ok",
      environment: env.NODE_ENV,
      uptime: Math.round(process.uptime()),
      database: connectionStates[mongoose.connection.readyState] ?? "unknown",
      timestamp: new Date().toISOString(),
    });
  }),
);

export default router;
