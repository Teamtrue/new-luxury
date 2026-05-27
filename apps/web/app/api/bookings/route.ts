/**
 * GET  /api/bookings  — member's own bookings (paginated, filterable)
 * POST /api/bookings  — create a booking (without payment — payment is separate)
 *
 * Booking creation flow:
 *   1. Validate deal access (active, not expired, member tier OK)
 *   2. Check booking cap (current_bookings < max_bookings)
 *   3. Calculate amounts in paise (club price + 18% GST - token discount)
 *   4. Debit tokens if tokens_used > 0
 *   5. Insert booking record with status='pending'
 *   6. Increment deal.current_bookings
 *   7. Return booking + next step = call /api/payments/create-order
 */

import { parseBody, requireAuth, apiSuccess, apiError, getPagination } from '@/lib/api-helpers';
import { assertRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { assertCsrf }                   from '@/lib/security/csrf';
import { createServiceRoleClient }      from '@/lib/supabase/service';
import { createBookingSchema }          from '@/lib/validations';
import { logAudit }                     from '@/lib/audit';
import { tierOrder, canAccessDeal }     from '@/lib/utils';
import type { Tier }                    from '@/lib/types';

const TIER_RANK: Record<string, number> = {
  silver:   1,
  gold:     2,
  platinum: 3,
  obsidian: 4,
};

/** Earn rate per tier: % of total_paise credited as tokens. */
const TOKEN_EARN_RATES: Record<string, number> = {
  silver:   1.0,
  gold:     1.25,
  platinum: 1.50,
  obsidian: 2.00,
};

/** Max redemption % per tier (applied to total_paise before token discount). */
const MAX_REDEMPTION_PCT: Record<string, number> = {
  silver:   20,
  gold:     20,
  platinum: 30,
  obsidian: 50,
};

/** 1 PC Token = ₹0.50 = 50 paise. */
const TOKEN_VALUE_PAISE = 50;

// ---------------------------------------------------------------------------
// GET /api/bookings
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');
  const { limit, offset, page } = getPagination(searchParams);

  const db = createServiceRoleClient();

  try {
    let query = db
      .from('bookings')
      .select(
        `
          id,
          status,
          booking_ref,
          amount_paise,
          club_price_paise,
          gst_paise,
          total_paise,
          tokens_used,
          tokens_earned,
          token_discount_paise,
          payment_method,
          delivery_address,
          notes,
          created_at,
          updated_at,
          cancelled_at,
          cancellation_reason,
          deals (
            id,
            title,
            category,
            brand,
            image_url
          )
        `,
        { count: 'exact' }
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/bookings] DB error:', error.message);
      return apiError('Failed to fetch bookings.', 500);
    }

    return apiSuccess({
      bookings:  data ?? [],
      total:     count ?? 0,
      page,
      limit,
      pages:     Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    console.error('[GET /api/bookings] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/bookings
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  const { user } = auth;

  // Rate limit by user ID.
  const rateLimitError = await assertRateLimit('bookings:create', user.id);
  if (rateLimitError) return rateLimitError;

  // CSRF check.
  const csrfError = assertCsrf(request, user.id);
  if (csrfError) return csrfError;

  const parsed = await parseBody(request, createBookingSchema);
  if ('error' in parsed) return parsed.error;
  const { deal_id, tokens_used, payment_method, delivery_address, notes } = parsed.data;

  const db = createServiceRoleClient();

  try {
    // 1. Load deal.
    const { data: deal, error: dealError } = await db
      .from('deals')
      .select(
        'id, title, category, status, min_tier, club_price_paise, valid_until, max_bookings, current_bookings, token_earn_multiplier'
      )
      .eq('id', deal_id)
      .single();

    if (dealError || !deal) {
      return apiError('Deal not found.', 404);
    }

    const d = deal as Record<string, unknown>;

    // 2. Deal must be active.
    if (d.status !== 'active') {
      return apiError('This deal is not currently available.', 400);
    }

    // 3. Check expiry.
    if (d.valid_until) {
      const expiresAt = new Date(d.valid_until as string);
      if (expiresAt < new Date()) {
        return apiError('This deal has expired.', 400);
      }
    }

    // 4. Load member's active membership + token balance.
    const { data: membership, error: membershipError } = await db
      .from('memberships')
      .select('id, status, membership_plans ( slug )')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (membershipError || !membership) {
      return apiError('You do not have an active membership.', 403);
    }

    const plans     = Array.isArray(membership.membership_plans)
      ? membership.membership_plans
      : [membership.membership_plans];
    const plan      = plans[0] as Record<string, unknown> | null;
    const memberTier = (plan?.slug as string) ?? 'silver';

    // 5. Tier access check.
    const dealMinTier = d.min_tier as string;
    if (TIER_RANK[memberTier] < TIER_RANK[dealMinTier]) {
      return apiError(
        `This deal requires ${dealMinTier} membership or higher. Your current tier is ${memberTier}.`,
        403
      );
    }

    // 6. Booking cap.
    if (d.max_bookings !== null && d.max_bookings !== undefined) {
      if ((d.current_bookings as number) >= (d.max_bookings as number)) {
        return apiError('This deal is fully booked.', 409);
      }
    }

    // 7. Calculate amounts in paise.
    const clubPricePaise = d.club_price_paise as number;
    const gstPaise       = Math.round(clubPricePaise * 0.18);
    const subtotalPaise  = clubPricePaise + gstPaise;

    // 8. Token redemption.
    let actualTokensUsed      = tokens_used ?? 0;
    let tokenDiscountPaise    = 0;

    if (actualTokensUsed > 0) {
      // Get member's current token balance.
      const { data: tokenRows } = await db
        .from('token_transactions')
        .select('amount')
        .eq('user_id', user.id);

      const tokenBalance = (tokenRows ?? []).reduce(
        (sum: number, row: { amount: number }) => sum + row.amount,
        0
      );

      if (actualTokensUsed > tokenBalance) {
        return apiError(
          `tokens_used (${actualTokensUsed}) exceeds your balance (${tokenBalance}).`,
          400
        );
      }

      // Cap at max redemption % for tier.
      const maxRedemptionPct = MAX_REDEMPTION_PCT[memberTier] ?? 20;
      const maxTokensPaise   = Math.round(subtotalPaise * (maxRedemptionPct / 100));
      const maxTokens        = Math.floor(maxTokensPaise / TOKEN_VALUE_PAISE);

      if (actualTokensUsed > maxTokens) {
        return apiError(
          `Maximum token redemption for your tier is ${maxTokens} tokens (${maxRedemptionPct}% of order value).`,
          400
        );
      }

      tokenDiscountPaise = actualTokensUsed * TOKEN_VALUE_PAISE;
    }

    const totalPaise = Math.max(0, subtotalPaise - tokenDiscountPaise);

    // 9. Calculate tokens to earn.
    const earnRatePct  = TOKEN_EARN_RATES[memberTier] ?? 1.0;
    const multiplier   = (d.token_earn_multiplier as number) ?? 1.0;
    const tokensEarned = Math.floor(totalPaise * (earnRatePct / 100) * multiplier);

    // 10. Generate booking ref (client-side fallback — DB function preferred).
    const bookingRef = generateBookingRef();

    // 11. If tokens are being redeemed, debit them now (before booking insert).
    if (actualTokensUsed > 0) {
      // Get current balance for balance_after snapshot.
      const { data: tokenRows } = await db
        .from('token_transactions')
        .select('amount')
        .eq('user_id', user.id);

      const currentBalance = (tokenRows ?? []).reduce(
        (sum: number, row: { amount: number }) => sum + row.amount,
        0
      );

      const { error: debitError } = await db.from('token_transactions').insert({
        user_id:        user.id,
        type:           'redeemed',
        amount:         -actualTokensUsed,
        balance_after:  currentBalance - actualTokensUsed,
        reference_type: 'booking',
        reference_id:   null, // updated after booking insert
        description:    `Token redemption for booking ${bookingRef}`,
      });

      if (debitError) {
        console.error('[POST /api/bookings] Token debit failed:', debitError.message);
        return apiError('Failed to apply token redemption. Please try again.', 500);
      }
    }

    // 12. Insert booking.
    const { data: booking, error: bookingError } = await db
      .from('bookings')
      .insert({
        user_id:              user.id,
        deal_id:              deal_id,
        status:               'pending',
        amount_paise:         clubPricePaise,
        club_price_paise:     clubPricePaise,
        gst_paise:            gstPaise,
        total_paise:          totalPaise,
        tokens_used:          actualTokensUsed,
        tokens_earned:        tokensEarned,
        token_discount_paise: tokenDiscountPaise,
        payment_method:       payment_method ?? null,
        delivery_address:     delivery_address,
        notes:                notes ?? null,
        booking_ref:          bookingRef,
      })
      .select('id, booking_ref, status, total_paise, tokens_used, tokens_earned')
      .single();

    if (bookingError) {
      console.error('[POST /api/bookings] Booking insert error:', bookingError.message);
      return apiError('Failed to create booking. Please try again.', 500);
    }

    const bookingData = booking as Record<string, unknown>;

    // 13. Update token debit reference_id to the booking ID.
    if (actualTokensUsed > 0) {
      await db
        .from('token_transactions')
        .update({ reference_id: bookingData.id })
        .eq('user_id', user.id)
        .eq('reference_type', 'booking')
        .is('reference_id', null)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    // 14. Increment deal.current_bookings.
    // Direct update — no custom RPC required.
    await db
      .from('deals')
      .update({ current_bookings: (d.current_bookings as number) + 1 })
      .eq('id', deal_id);

    // 15. Audit log.
    const ip = getClientIP(request);
    await logAudit({
      action:      'booking.created',
      actor_type:  'member',
      actor_id:    user.id,
      target_type: 'booking',
      target_id:   bookingData.id as string,
      details:     {
        deal_id,
        booking_ref:    bookingRef,
        total_paise:    totalPaise,
        tokens_used:    actualTokensUsed,
        tokens_earned:  tokensEarned,
        tier:           memberTier,
      },
      ip_address:  ip,
      user_agent:  request.headers.get('user-agent') ?? undefined,
    });

    // TODO: AI — fraud scoring injection point.
    // lib/ai/fraud.ts should be called here to score this booking.
    // Flag for manual review if score exceeds threshold.
    // See docs/AI_ROADMAP.md for interface contract.

    return apiSuccess(
      {
        booking: bookingData,
        next_step: 'call POST /api/payments/create-order with { booking_id }',
      },
      201
    );
  } catch (err) {
    console.error('[POST /api/bookings] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function generateBookingRef(): string {
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let   result = 'BK-';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
