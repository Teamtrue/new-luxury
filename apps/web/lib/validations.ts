import { z } from 'zod';

export const phoneSchema = z.string().regex(/^\d{10}$/, 'Must be a 10-digit mobile number');

export const otpSchema = z.string().regex(/^\d{6}$/, 'Must be a 6-digit OTP');

export const sendOtpSchema = z.object({ phone: phoneSchema });

export const verifyOtpSchema = z.object({ phone: phoneSchema, otp: otpSchema });

export const createBookingSchema = z.object({
  deal_id: z.string().min(1, 'deal_id is required'),
  tokens_used: z.number().int().min(0).max(50000).default(0),
  payment_method: z.enum(['upi', 'netbanking', 'card', 'emi']).optional(),
  delivery_address: z.string().min(10, 'Please provide a complete delivery address').max(500),
  notes: z.string().max(500).optional(),
});

export const createDealSchema = z.object({
  title: z.string().min(3).max(200),
  category: z.string().min(1),
  brand: z.string().optional(),
  description: z.string().max(2000).optional(),
  club_price: z.number().int().positive('Club price must be positive'),
  retail_price: z.number().int().positive('Retail price must be positive'),
  min_tier: z.enum(['silver', 'gold', 'platinum', 'obsidian']),
  expires_at: z.string().datetime({ message: 'Invalid date format' }),
  max_bookings: z.number().int().positive().optional(),
});

export const updateMemberSchema = z.object({
  tier: z.enum(['silver', 'gold', 'platinum', 'obsidian']).optional(),
  status: z.enum(['active', 'expired', 'suspended', 'pending']).optional(),
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
});

export const memberSignupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  phone: phoneSchema,
  tier: z.enum(['silver', 'gold', 'platinum', 'obsidian']).default('silver'),
  referred_by: z.string().optional(),
});

export const paymentVerifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  booking_id: z.string().optional(),
});

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export function validate<T>(schema: z.ZodType<T>, data: unknown): { data: T } | { error: string; details: z.ZodIssue[] } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? 'Validation failed', details: result.error.issues };
  }
  return { data: result.data };
}
