import { z } from "zod";

const nonEmpty = z.string().min(1);

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SUPABASE_URL: nonEmpty,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  RAZORPAY_KEY_ID: nonEmpty,
  RAZORPAY_KEY_SECRET: nonEmpty,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: nonEmpty,
  RAZORPAY_WEBHOOK_SECRET: nonEmpty,
  UPSTASH_REDIS_URL: nonEmpty,
  UPSTASH_REDIS_TOKEN: nonEmpty,
  REDIS_URL: nonEmpty,
  CSRF_SECRET: nonEmpty,
  INTERNAL_JOB_TOKEN: nonEmpty,
  SENTRY_DSN: z.string().optional()
});

export const mobileEnvSchema = z.object({
  API_BASE_URL: z.string().url(),
  RAZORPAY_KEY_ID: nonEmpty,
  IOS_PAYMENT_DISABLED: z.coerce.boolean().default(false)
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type MobileEnv = z.infer<typeof mobileEnvSchema>;

export function parseServerEnv(env: NodeJS.ProcessEnv): ServerEnv {
  return serverEnvSchema.parse(env);
}

export function parseMobileEnv(env: Record<string, unknown>): MobileEnv {
  return mobileEnvSchema.parse(env);
}
