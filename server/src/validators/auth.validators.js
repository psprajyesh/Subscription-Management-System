import { z } from "zod";

const emailSchema = z
  .string({ error: "Email is required" })
  .trim()
  .email("Email address is invalid")
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string({ error: "Password is required" })
  .min(8, "Password must be at least 8 characters long")
  .max(128, "Password must be at most 128 characters long")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const registerSchema = z
  .object({
    name: z
      .string({ error: "Name is required" })
      .trim()
      .min(2, "Name must be at least 2 characters long")
      .max(80, "Name must be at most 80 characters long"),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z
      .string({ error: "Password is required" })
      .min(1, "Password is required")
      .max(128, "Password must be at most 128 characters long"),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Current password is required" })
      .min(1, "Current password is required")
      .max(128, "Current password must be at most 128 characters long"),
    newPassword: passwordSchema,
  })
  .strict();
