/**
 * app/api/internal/memberships/renew/route.ts
 * ---------------------------------------------------------------------------
 * POST /api/internal/memberships/renew
 *
 * Cron job (runs daily):
 *   1. Find memberships expiring in the next 3 days with auto_renew=true
 *      → For V1: queue renewal reminder email (stored payment methods not yet implemented)
 *   2. Find expired memberships (expires_at < now()) → set status='expired'
 *
 * Auth: Bearer INTERNAL_JOB_TOKEN header required.
 * ---------------------------------------------------------------------------
 */

import { apiSuccess, apiError, buildAuditEntry } from '@/lib/api-helpers';
import { createServiceRoleClient }               from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// Bearer token guard
// ---------------------------------------------------------------------------

function assertInternalAuth(request: Request): Response | null {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  if (!expected) {
    // In dev without the env var, allow through with a warning.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[internal] INTERNAL_JOB_TOKEN not set — skipping auth in dev mode.');
      return null;
    }
    return new Response(
      JSON.stringify({ success: false, error: 'Internal job token not configured.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader !== `Bearer ${expected}`) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// POST /api/internal/memberships/renew
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  const authError = assertInternalAuth(request);
  if (authError) return authError;

  const db = createServiceRoleClient();
  const now = new Date();

  let renewed  = 0;
  let expired  = 0;
  let errors   = 0;

  try {
    // -----------------------------------------------------------------------
    // 1. Find memberships expiring in the next 3 days with auto_renew=true
    // -----------------------------------------------------------------------
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: soonExpiring, error: soonError } = await db
      .from('memberships')
      .select(`
        id,
        user_id,
        expires_at,
        membership_plans ( name, slug, price_paise )
      `)
      .eq('status', 'active')
      .eq('auto_renew', true)
      .lte('expires_at', threeDaysFromNow)
      .gte('expires_at', now.toISOString());

    if (soonError) {
      console.error('[internal/memberships/renew] soonExpiring query error:', soonError.message);
      return apiError('Failed to query expiring memberships.', 500);
    }

    // V1: queue renewal reminder notifications instead of charging
    // TODO: V2 — implement stored payment methods and auto-charge here
    for (const membership of soonExpiring ?? []) {
      try {
        const plan = Array.isArray(membership.membership_plans)
          ? membership.membership_plans[0]
          : membership.membership_plans;

        const daysUntilExpiry = Math.ceil(
          (new Date(membership.expires_at as string).getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24)
        );

        // Determine template based on days remaining
        const templateName =
          daysUntilExpiry <= 1 ? 'MEMBERSHIP_EXPIRY_FINAL'
          : daysUntilExpiry <= 3 ? 'MEMBERSHIP_RENEWAL_URGENT'
          : 'MEMBERSHIP_RENEWAL_REMINDER';

        // Check for duplicate notification (avoid spamming)
        const { data: existingNotif } = await db
          .from('notifications')
          .select('id')
          .eq('user_id', membership.user_id)
          .eq('template_name', templateName)
          .eq('status', 'queued')
          .maybeSingle();

        if (!existingNotif) {
          await db.from('notifications').insert({
            user_id:        membership.user_id,
            channel:        'email',
            template_name:  templateName,
            template_data:  {
              membership_id: membership.id,
              expires_at:    membership.expires_at,
              plan_name:     (plan as { name?: string })?.name ?? 'Silver',
              plan_slug:     (plan as { slug?: string })?.slug ?? 'silver',
              price_paise:   (plan as { price_paise?: number })?.price_paise ?? 0,
              days_remaining: daysUntilExpiry,
            },
            status:          'queued',
            priority:        daysUntilExpiry <= 1 ? 'critical' : 'high',
            scheduled_for:   now.toISOString(),
          });
        }

        renewed++;

        await db.from('audit_logs').insert(
          buildAuditEntry({
            action:     'membership.renewal_reminder_queued',
            actorType:  'system',
            targetType: 'membership',
            targetId:   membership.id,
            details:    { user_id: membership.user_id, expires_at: membership.expires_at, days_remaining: daysUntilExpiry },
          })
        );
      } catch (itemErr) {
        console.error('[internal/memberships/renew] error processing membership:', membership.id, itemErr);
        errors++;
      }
    }

    // -----------------------------------------------------------------------
    // 2. Find and expire overdue memberships
    // -----------------------------------------------------------------------
    const { data: toExpire, error: expireQueryError } = await db
      .from('memberships')
      .select('id, user_id')
      .eq('status', 'active')
      .lt('expires_at', now.toISOString());

    if (expireQueryError) {
      console.error('[internal/memberships/renew] toExpire query error:', expireQueryError.message);
      return apiError('Failed to query memberships to expire.', 500);
    }

    for (const membership of toExpire ?? []) {
      try {
        const { error: updateError } = await db
          .from('memberships')
          .update({ status: 'expired' })
          .eq('id', membership.id);

        if (updateError) {
          console.error('[internal/memberships/renew] expire update error:', updateError.message);
          errors++;
          continue;
        }

        expired++;

        await db.from('audit_logs').insert(
          buildAuditEntry({
            action:     'membership.expired',
            actorType:  'system',
            targetType: 'membership',
            targetId:   membership.id,
            details:    { user_id: membership.user_id },
          })
        );
      } catch (itemErr) {
        console.error('[internal/memberships/renew] error expiring membership:', membership.id, itemErr);
        errors++;
      }
    }

    return apiSuccess({
      processed: (soonExpiring?.length ?? 0) + (toExpire?.length ?? 0),
      renewed,   // reminders queued
      expired,
      errors,
      ran_at:   now.toISOString(),
    });
  } catch (err) {
    console.error('[internal/memberships/renew] unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
