/**
 * POST /api/payments/verify
 * ---------------------------------------------------------------------------
 * Called by the client immediately after the payment gateway checkout completes.
 * Verifies the HMAC signature, updates booking status, and credits PC Tokens.
 *
 * The payment webhook (POST /api/webhooks/razorpay) is the authoritative
 * confirmation signal — this endpoint provides the user with instant feedback.
 * Both are idempotent: the second one to run simply finds the booking already
 * in 'confirmed' state and returns success.
 * ---------------------------------------------------------------------------
 */

import { parseBody, requireAuth, apiSuccess, apiError } from '@/lib/api-helpers';
import { assertCsrf }              from '@/lib/security/csrf';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { getPaymentProvider }      from '@/lib/providers';
import { ProviderNotConfiguredError } from '@/lib/providers';
import { paymentVerifySchema }     from '@/lib/validations';
import { logAudit }                from '@/lib/audit';
import { getClientIP }             from '@/lib/security/rate-limit';

/** Earn rate per tier: % of total_paise credited as tokens. */
const TOKEN_EARN_RATES: Record<string, number> = {
  silver:   1.0,
  gold:     1.25,
  platinum: 1.50,
  obsidian: 2.00,
};

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const csrfError = assertCsrf(request, user.id);
  if (csrfError) return csrfError;

  const parsed = await parseBody(request, paymentVerifySchema);
  if ('error' in parsed) return parsed.error;

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    booking_id,
  } = parsed.data;

  const db = createServiceRoleClient();

  try {
    // 1. Look up the payment record by provider order ID.
    const { data: payment, error: paymentFetchError } = await db
      .from('payments')
      .select('id, booking_id, membership_id, user_id, status, amount_paise, provider')
      .eq('provider_order_id', razorpay_order_id)
      .single();

    if (paymentFetchError || !payment) {
      return apiError('Payment record not found.', 404);
    }

    const p = payment as Record<string, unknown>;

    // Verify payment belongs to caller.
    if (p.user_id !== user.id) {
      return apiError('Forbidden.', 403);
    }

    // Idempotency: if already captured, return success.
    if (p.status === 'captured') {
      const { data: bk } = await db
        .from('bookings')
        .select('booking_ref, tokens_earned')
        .eq('id', p.booking_id as string)
        .single();

      const bkData = bk as Record<string, unknown> | null;
      return apiSuccess({
        booking_ref:   bkData?.booking_ref ?? null,
        tokens_earned: bkData?.tokens_earned ?? 0,
        status:        'already_confirmed',
      });
    }

    // 2. Verify HMAC signature.
    let provider;
    try {
      provider = await getPaymentProvider();
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        return apiError('Payment gateway is not configured.', 503);
      }
      throw err;
    }

    const isValid = provider.verifySignature({
      orderId:   razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isValid) {
      const ip = getClientIP(request);
      await logAudit({
        action:      'payment.failed',
        actor_type:  'member',
        actor_id:    user.id,
        target_type: 'payment',
        target_id:   p.id as string,
        details:     {
          reason:    'invalid_signature',
          order_id:  razorpay_order_id,
          payment_id: razorpay_payment_id,
        },
        ip_address:  ip,
      });
      return apiError('Invalid payment signature. Please contact support.', 400);
    }

    // 3. Update payment status to 'captured'.
    const { error: paymentUpdateError } = await db
      .from('payments')
      .update({
        status:               'captured',
        provider_payment_id:  razorpay_payment_id,
        provider_signature:   razorpay_signature,
      })
      .eq('id', p.id);

    if (paymentUpdateError) {
      console.error('[POST /api/payments/verify] Payment update error:', paymentUpdateError.message);
    }

    // 4. Activate membership payments only after a valid provider signature.
    const membershipId = p.membership_id as string | null;
    if (membershipId) {
      await activateMembership(db, membershipId, user.id);
      return apiSuccess({ status: 'membership_activated', tokens_earned: 0 });
    }

    // 5. Determine the booking to confirm.
    const resolvedBookingId = (p.booking_id as string | null) ?? booking_id;
    if (!resolvedBookingId) {
      return apiSuccess({ status: 'payment_confirmed', tokens_earned: 0 });
    }

    // 5. Load booking to get tokens_earned + confirm it's still pending.
    const { data: booking, error: bookingFetchError } = await db
      .from('bookings')
      .select('id, booking_ref, status, tokens_earned, user_id, deal_id')
      .eq('id', resolvedBookingId)
      .single();

    if (bookingFetchError || !booking) {
      return apiError('Booking not found.', 404);
    }

    const bk = booking as Record<string, unknown>;

    // Idempotency: booking already confirmed (webhook beat us to it).
    if (bk.status === 'confirmed') {
      return apiSuccess({
        booking_ref:   bk.booking_ref,
        tokens_earned: bk.tokens_earned,
        status:        'already_confirmed',
      });
    }

    // 6. Update booking to 'confirmed'.
    const { error: bookingUpdateError } = await db
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', resolvedBookingId)
      .eq('status', 'pending'); // guard against concurrent updates

    if (bookingUpdateError) {
      console.error('[POST /api/payments/verify] Booking update error:', bookingUpdateError.message);
      return apiError('Failed to confirm booking. Contact support with your booking reference.', 500);
    }

    // 7. Credit earned tokens.
    const tokensEarned = bk.tokens_earned as number;
    if (tokensEarned > 0) {
      // Get current balance for the balance_after snapshot.
      const { data: tokenRows } = await db
        .from('token_transactions')
        .select('amount')
        .eq('user_id', user.id);

      const currentBalance = (tokenRows ?? []).reduce(
        (sum: number, row: { amount: number }) => sum + row.amount,
        0
      );

      const { error: tokenError } = await db.from('token_transactions').insert({
        user_id:        user.id,
        type:           'earned',
        amount:         tokensEarned,
        balance_after:  currentBalance + tokensEarned,
        reference_type: 'booking',
        reference_id:   resolvedBookingId,
        description:    `Tokens earned on booking ${bk.booking_ref}`,
      });

      if (tokenError) {
        console.error('[POST /api/payments/verify] Token credit error:', tokenError.message);
        // Non-fatal: booking is confirmed; tokens can be credited manually.
      }
    }

    // 8. Audit log.
    const ip = getClientIP(request);
    await logAudit({
      action:      'payment.verified',
      actor_type:  'member',
      actor_id:    user.id,
      target_type: 'booking',
      target_id:   resolvedBookingId,
      details:     {
        order_id:       razorpay_order_id,
        payment_id:     razorpay_payment_id,
        booking_ref:    bk.booking_ref,
        tokens_earned:  tokensEarned,
      },
      ip_address: ip,
    });

    // TODO: AI — churn prediction update injection point.
    // After a confirmed booking, update the churn model with booking signal.
    // See docs/AI_ROADMAP.md for lib/ai/churn.ts interface.

    return apiSuccess({
      booking_ref:   bk.booking_ref,
      tokens_earned: tokensEarned,
      status:        'confirmed',
    });

  } catch (err) {
    console.error('[POST /api/payments/verify] Unexpected error:', err);
    return apiError('Payment verification failed. Please contact support.', 500);
  }
}

async function activateMembership(
  db: ReturnType<typeof createServiceRoleClient>,
  membershipId: string,
  userId: string
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  await db
    .from('memberships')
    .update({
      status: 'active',
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq('id', membershipId)
    .eq('user_id', userId)
    .eq('status', 'pending');
}
