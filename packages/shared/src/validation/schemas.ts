import { z } from "zod";

export const indianPhoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

export const otpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit OTP");

export const memberTierSchema = z.enum(["silver", "gold", "platinum", "obsidian"]);

export const dealQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
  featured: z.coerce.boolean().optional(),
  category: z.string().min(1).optional(),
  minSavings: z.coerce.number().int().min(0).max(100).optional(),
  tier: memberTierSchema.optional(),
  search: z.string().trim().max(120).optional()
});

export const verifyOtpSchema = z.object({
  phone: indianPhoneSchema,
  otp: otpSchema
});
