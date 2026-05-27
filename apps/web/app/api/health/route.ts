/**
 * GET /api/health
 * ---------------------------------------------------------------------------
 * Health-check endpoint.
 *
 * Checks:
 *   - Supabase connectivity (simple table query via service role)
 *   - Active payment provider
 *   - Active SMS provider
 *   - Active email provider
 *
 * Returns HTTP 200 if healthy, 503 if any critical service is unavailable.
 * Non-critical services (SMS, email) are reported but do not affect status.
 * ---------------------------------------------------------------------------
 */

import { createServiceRoleClient } from '@/lib/supabase/service';
import { getPaymentProvider, getSMSProvider, getEmailProvider } from '@/lib/providers';
import { ProviderNotConfiguredError } from '@/lib/providers';
import { getSecurityHeaders }         from '@/lib/security/headers';

export const dynamic = 'force-dynamic';

interface HealthCheck {
  status: 'ok' | 'error' | 'not_configured';
  provider?: string;
  test_mode?: boolean;
  detail?: string;
}

export async function GET(): Promise<Response> {
  const checks: Record<string, HealthCheck> = {};
  const startMs = Date.now();

  // --- Supabase connectivity ---
  try {
    const db = createServiceRoleClient();
    // Lightweight query: count platform_settings rows.
    const { error } = await db
      .from('platform_settings')
      .select('key', { count: 'exact', head: true });

    checks.supabase = error
      ? { status: 'error', detail: error.message }
      : { status: 'ok' };
  } catch (err) {
    checks.supabase = {
      status: 'error',
      detail: err instanceof Error ? err.message : 'Connection failed',
    };
  }

  // --- Payment provider ---
  try {
    const provider = await getPaymentProvider();
    checks.payment_provider = {
      status:    'ok',
      provider:  provider.name,
      test_mode: provider.isTestMode,
    };
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      checks.payment_provider = { status: 'not_configured' };
    } else {
      checks.payment_provider = { status: 'error', detail: 'Provider instantiation failed' };
    }
  }

  // --- SMS provider ---
  try {
    const provider = await getSMSProvider();
    checks.sms_provider = { status: 'ok', provider: provider.name };
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      checks.sms_provider = { status: 'not_configured' };
    } else {
      checks.sms_provider = { status: 'error', detail: 'Provider instantiation failed' };
    }
  }

  // --- Email provider ---
  try {
    const provider = await getEmailProvider();
    checks.email_provider = { status: 'ok', provider: provider.name };
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      checks.email_provider = { status: 'not_configured' };
    } else {
      checks.email_provider = { status: 'error', detail: 'Provider instantiation failed' };
    }
  }

  // Determine overall health: only Supabase + payment provider are critical.
  const criticalOk =
    checks.supabase.status !== 'error' &&
    checks.payment_provider.status !== 'error';

  const overallStatus = criticalOk ? 'ok' : 'degraded';
  const httpStatus    = criticalOk ? 200 : 503;

  return new Response(
    JSON.stringify({
      status:     overallStatus,
      timestamp:  new Date().toISOString(),
      latency_ms: Date.now() - startMs,
      version:    process.env.npm_package_version ?? '0.1.0',
      checks,
    }),
    {
      status: httpStatus,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...getSecurityHeaders(),
      },
    }
  );
}
