/**
 * GET /api/referrals
 * ---------------------------------------------------------------------------
 * Returns the authenticated member's referral dashboard data:
 *   - Their referral code
 *   - Summary stats (total referrals, active referrals, commission earned, bonuses)
 *   - Full list of referral records with referee details
 *
 * Uses service role to join referrals → user_profiles for referee names.
 * ---------------------------------------------------------------------------
 */

import { requireAuth, apiSuccess, apiError, getPagination } from '@/lib/api-helpers';
import { createServiceRoleClient } from '@/lib/supabase/service';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(request.url);
  const { limit, offset, page } = getPagination(searchParams);

  const db = createServiceRoleClient();

  try {
    // 1. Get member's active membership for referral_code.
    const { data: membership, error: membershipError } = await db
      .from('memberships')
      .select('referral_code, membership_plans ( slug )')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (membershipError) {
      console.error('[GET /api/referrals] Membership query error:', membershipError.message);
      return apiError('Failed to load referral data.', 500);
    }

    const referralCode = membership?.referral_code ?? null;

    // 2. Fetch referrals where caller is the referrer.
    const { data: referrals, error: referralError, count } = await db
      .from('referrals')
      .select(
        `
          id,
          referee_user_id,
          referral_code,
          status,
          referrer_token_bonus,
          referee_token_bonus,
          trail_commission_rate_pct,
          trail_commission_earned_paise,
          activated_at,
          expires_at,
          created_at,
          referee:user_profiles!referrals_referee_user_id_fkey (
            id,
            full_name,
            phone
          ),
          referee_membership:memberships!referrals_referee_user_id_fkey (
            status,
            membership_plans ( slug, name )
          )
        `,
        { count: 'exact' }
      )
      .eq('referrer_user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (referralError) {
      console.error('[GET /api/referrals] Referrals query error:', referralError.message);
      return apiError('Failed to load referrals.', 500);
    }

    const allReferrals = referrals ?? [];

    // 3. Compute summary stats.
    // Fetch ALL referrals (no pagination) for accurate aggregate stats.
    const { data: allReferralRows } = await db
      .from('referrals')
      .select('status, trail_commission_earned_paise, referrer_token_bonus, activated_at')
      .eq('referrer_user_id', user.id);

    const rows = allReferralRows ?? [];
    const stats = {
      total:                    rows.length,
      active:                   rows.filter((r) => r.status === 'activated' || r.status === 'rewarded').length,
      pending:                  rows.filter((r) => r.status === 'pending').length,
      trail_commission_earned_paise: rows.reduce(
        (sum, r) => sum + (r.trail_commission_earned_paise as number ?? 0),
        0
      ),
      token_bonuses:            rows.reduce(
        (sum, r) => sum + (r.referrer_token_bonus as number ?? 0),
        0
      ),
    };

    // 4. Format referral list.
    const formattedReferrals = allReferrals.map((r) => {
      const ref = r as Record<string, unknown>;
      const refereeProfile = Array.isArray(ref.referee)
        ? ref.referee[0]
        : ref.referee;
      const refereeMemberships = Array.isArray(ref.referee_membership)
        ? ref.referee_membership
        : [ref.referee_membership];
      const refereeMembership = refereeMemberships[0] as Record<string, unknown> | null;
      const refereePlans = refereeMembership
        ? (Array.isArray(refereeMembership.membership_plans)
            ? refereeMembership.membership_plans
            : [refereeMembership.membership_plans])
        : [];
      const refereePlan = refereePlans[0] as Record<string, unknown> | null;

      return {
        id:                            ref.id,
        status:                        ref.status,
        referral_code:                 ref.referral_code,
        trail_commission_rate_pct:     ref.trail_commission_rate_pct,
        trail_commission_earned_paise: ref.trail_commission_earned_paise,
        token_bonus:                   ref.referrer_token_bonus,
        activated_at:                  ref.activated_at,
        expires_at:                    ref.expires_at,
        created_at:                    ref.created_at,
        referee: refereeProfile
          ? {
              id:        (refereeProfile as Record<string, unknown>).id,
              full_name: (refereeProfile as Record<string, unknown>).full_name,
              // Mask phone for privacy: show only last 4 digits.
              phone:     maskPhone((refereeProfile as Record<string, unknown>).phone as string | null),
              tier:      refereePlan?.slug ?? null,
              tier_name: refereePlan?.name ?? null,
              membership_status: refereeMembership?.status ?? null,
            }
          : null,
      };
    });

    // TODO: AI — upgrade propensity injection point.
    // lib/ai/upgrade.ts should score whether this member's referrals suggest
    // they're likely to upgrade tier. See docs/AI_ROADMAP.md.

    return apiSuccess({
      referral_code: referralCode,
      stats,
      referrals:     formattedReferrals,
      total:         count ?? 0,
      page,
      limit,
      pages:         Math.ceil((count ?? 0) / limit),
    });

  } catch (err) {
    console.error('[GET /api/referrals] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  // Keep country code + first few digits, mask middle, show last 4.
  // e.g. +919876543210 → +91 98*** ***3210
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '***masked***';
  return '****' + digits.slice(-4);
}
