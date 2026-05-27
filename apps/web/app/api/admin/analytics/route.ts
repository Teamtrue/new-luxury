/**
 * app/api/admin/analytics/route.ts
 * ---------------------------------------------------------------------------
 * GET /api/admin/analytics
 * Returns aggregated business metrics for the admin dashboard.
 *
 * Query params:
 *   period    — 'month' | 'quarter' | 'year' (default 'month')
 *   from_date — ISO date string (overrides period start)
 *   to_date   — ISO date string (overrides period end)
 * ---------------------------------------------------------------------------
 */

import { apiSuccess, apiError, requireAdmin } from '@/lib/api-helpers';
import { createServiceRoleClient }            from '@/lib/supabase/service';

// TODO: AI — Feed analytics data into the churn prediction model in lib/ai/churn.ts
// TODO: AI — Upgrade propensity signals live in the by_tier breakdown

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPeriodDates(period: string): { from: string; to: string } {
  const now  = new Date();
  const to   = now.toISOString();

  switch (period) {
    case 'year': {
      const from = new Date(now);
      from.setFullYear(from.getFullYear() - 1);
      return { from: from.toISOString(), to };
    }
    case 'quarter': {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 3);
      return { from: from.toISOString(), to };
    }
    case 'month':
    default: {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 1);
      return { from: from.toISOString(), to };
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/analytics
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, 'analytics:read');
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const period   = searchParams.get('period') ?? 'month';
  const fromParam = searchParams.get('from_date');
  const toParam   = searchParams.get('to_date');

  const { from: defaultFrom, to: defaultTo } = getPeriodDates(period);
  const fromDate = fromParam ?? defaultFrom;
  const toDate   = toParam   ?? defaultTo;

  try {
    const db = createServiceRoleClient();

    // -----------------------------------------------------------------------
    // 1. GMV and commission (confirmed bookings in period)
    // -----------------------------------------------------------------------
    const { data: bookingAgg, error: bookingAggError } = await db
      .from('bookings')
      .select('total_paise, deals ( commission_pct )')
      .eq('status', 'confirmed')
      .gte('created_at', fromDate)
      .lte('created_at', toDate);

    if (bookingAggError) {
      console.error('[admin/analytics] bookingAgg error:', bookingAggError.message);
      return apiError('Failed to compute GMV metrics.', 500);
    }

    let gmvTotalPaise       = 0;
    let commissionTotalPaise = 0;
    const commissionByCategory: Record<string, number> = {};

    for (const b of bookingAgg ?? []) {
      gmvTotalPaise += b.total_paise as number;
      const deal = Array.isArray(b.deals) ? b.deals[0] : b.deals;
      const commissionPct = (deal as { commission_pct?: number })?.commission_pct ?? 3;
      const commission = Math.round(((b.total_paise as number) * commissionPct) / 100);
      commissionTotalPaise += commission;
    }

    // -----------------------------------------------------------------------
    // 2. Member counts by tier
    // -----------------------------------------------------------------------
    const { data: membersByTier, error: tierError } = await db
      .from('memberships')
      .select('status, membership_plans ( slug )')
      .eq('status', 'active');

    if (tierError) {
      console.error('[admin/analytics] membersByTier error:', tierError.message);
      return apiError('Failed to compute member tier metrics.', 500);
    }

    const tierCounts: Record<string, number> = {
      silver: 0, gold: 0, platinum: 0, obsidian: 0,
    };
    for (const m of membersByTier ?? []) {
      const plan = Array.isArray(m.membership_plans) ? m.membership_plans[0] : m.membership_plans;
      const slug = (plan as { slug?: string })?.slug ?? 'silver';
      if (slug in tierCounts) tierCounts[slug]++;
    }

    const totalActiveMembers = Object.values(tierCounts).reduce((a, b) => a + b, 0);

    // -----------------------------------------------------------------------
    // 3. New members in period
    // -----------------------------------------------------------------------
    const { count: newMembersCount, error: newMembersError } = await db
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', fromDate)
      .lte('created_at', toDate);

    if (newMembersError) {
      console.error('[admin/analytics] newMembers error:', newMembersError.message);
    }

    // -----------------------------------------------------------------------
    // 4. Total member count
    // -----------------------------------------------------------------------
    const { count: totalMembersCount } = await db
      .from('user_profiles')
      .select('id', { count: 'exact', head: true });

    // -----------------------------------------------------------------------
    // 5. Booking counts
    // -----------------------------------------------------------------------
    const { data: bookingCounts, error: bookingCountsError } = await db
      .from('bookings')
      .select('status')
      .gte('created_at', fromDate)
      .lte('created_at', toDate);

    let totalBookings     = 0;
    let confirmedBookings = 0;
    let cancelledBookings = 0;
    for (const b of bookingCounts ?? []) {
      totalBookings++;
      if (b.status === 'confirmed') confirmedBookings++;
      if (b.status === 'cancelled') cancelledBookings++;
    }

    // -----------------------------------------------------------------------
    // 6. Token liability (outstanding tokens = earned/bonus - redeemed/expired)
    // -----------------------------------------------------------------------
    const { data: tokenRows, error: tokenError } = await db
      .from('token_transactions')
      .select('type, amount');

    if (tokenError) {
      console.error('[admin/analytics] tokenError:', tokenError.message);
    }

    let totalEarned   = 0;
    let totalRedeemed = 0;
    for (const tx of tokenRows ?? []) {
      if (tx.type === 'earned' || tx.type === 'bonus') totalEarned  += tx.amount as number;
      if (tx.type === 'redeemed' || tx.type === 'expired') totalRedeemed += Math.abs(tx.amount as number);
    }

    const outstandingTokens = Math.max(0, totalEarned - totalRedeemed);
    // Assume 1 token = 0.50 INR = 50 paise
    const TOKEN_VALUE_PAISE = 50;
    const tokenLiabilityPaise = outstandingTokens * TOKEN_VALUE_PAISE;

    // -----------------------------------------------------------------------
    // 7. Deal status summary
    // -----------------------------------------------------------------------
    const { data: dealCounts, error: dealCountsError } = await db
      .from('deals')
      .select('status, valid_until');

    if (dealCountsError) {
      console.error('[admin/analytics] dealCounts error:', dealCountsError.message);
    }

    let activeDeals        = 0;
    let pendingReviewDeals = 0;
    let expiringSoonDeals  = 0;
    const soonThreshold    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const d of dealCounts ?? []) {
      if (d.status === 'active')         activeDeals++;
      if (d.status === 'pending_review') pendingReviewDeals++;
      if (d.status === 'active' && d.valid_until && d.valid_until < soonThreshold) expiringSoonDeals++;
    }

    // -----------------------------------------------------------------------
    // 8. GMV by month (last 12 months)
    // -----------------------------------------------------------------------
    const { data: monthlyGmv, error: monthlyError } = await db
      .from('bookings')
      .select('total_paise, created_at')
      .eq('status', 'confirmed')
      .gte('created_at', (() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString();
      })());

    const gmvByMonth: Record<string, number> = {};
    for (const b of monthlyGmv ?? []) {
      const month = (b.created_at as string).slice(0, 7); // "YYYY-MM"
      gmvByMonth[month] = (gmvByMonth[month] ?? 0) + (b.total_paise as number);
    }

    // -----------------------------------------------------------------------
    // Response
    // -----------------------------------------------------------------------

    return apiSuccess({
      period: { from: fromDate, to: toDate },
      gmv: {
        total_paise:        gmvTotalPaise,
        by_month:           Object.entries(gmvByMonth).map(([month, total_paise]) => ({ month, total_paise })),
      },
      commission: {
        total_paise:        commissionTotalPaise,
        by_category:        Object.entries(commissionByCategory).map(([category, total_paise]) => ({ category, total_paise })),
      },
      members: {
        total:              totalMembersCount ?? 0,
        active:             totalActiveMembers,
        new_this_period:    newMembersCount ?? 0,
        by_tier:            tierCounts,
      },
      bookings: {
        total:              totalBookings,
        confirmed:          confirmedBookings,
        cancelled:          cancelledBookings,
      },
      tokens: {
        total_earned:                totalEarned,
        total_redeemed:              totalRedeemed,
        outstanding_liability_paise: tokenLiabilityPaise,
      },
      deals: {
        active:               activeDeals,
        pending_review:       pendingReviewDeals,
        expiring_soon_count:  expiringSoonDeals,
      },
    });
  } catch (err) {
    console.error('[admin/analytics] unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
