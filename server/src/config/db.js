import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

mongoose.set("strictQuery", true);

/**
 * Connect to MongoDB. Works with a local instance or an Atlas URI.
 * The connection string is never logged with credentials.
 */
export async function connectDB(uri = env.MONGODB_URI) {
  mongoose.connection.on("connected", () => {
    logger.info(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  });

  mongoose.connection.on("error", (error) => {
    logger.error("MongoDB connection error", error.message);
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
  });

  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.connection.close();
}

export default connectDB;
