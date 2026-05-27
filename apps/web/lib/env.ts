/**
 * Server-side environment checks.
 *
 * Keep this tiny and boring on purpose: production must fail closed when a
 * required backing service or secret is absent. Local development can still run
 * UI work, but production must never silently enter mock or memory-only mode.
 */

const productionRequired = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "NEXT_PUBLIC_RAZORPAY_KEY_ID",
  "RAZORPAY_WEBHOOK_SECRET",
  "UPSTASH_REDIS_URL",
  "UPSTASH_REDIS_TOKEN",
  "CSRF_SECRET",
  "INTERNAL_JOB_TOKEN"
] as const;

export type ProductionEnvKey = (typeof productionRequired)[number];

export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const missing = productionRequired.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  }
}

export function requireEnv(name: ProductionEnvKey): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
