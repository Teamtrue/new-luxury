/**
 * POST /api/payments/create-order
 * ---------------------------------------------------------------------------
 * Creates a payment gateway order for either:
 *   a) A deal booking  — { booking_id }
 *   b) A membership    — { membership_tier }
 *
 * Returns the provider order details the client uses to open the checkout SDK.
 *
 * Idempotency: checks payments table for an existing order on the same
 * booking / membership tier before calling the gateway, so double-tapping
 * "Pay Now" does not create duplicate orders.
 * ---------------------------------------------------------------------------
 */

import { parseBody, requireAuth, apiSuccess, apiError } from '@/lib/api-helpers';
import { assertRateLimit, getClientIP }    from '@/lib/security/rate-limit';
import { assertCsrf }                      from '@/lib/security/csrf';
import { createServiceRoleClient }         from '@/lib/supabase/service';
import { getPaymentProvider }              from '@/lib/providers';
import { ProviderNotConfiguredError }       from '@/lib/providers';
import { logAudit }                        from '@/lib/audit';
import { hashToken }                       from '@/lib/security/tokens';
import { z }                               from 'zod';

const createOrderSchema = z.union([
  z.object({
    booking_id:       z.string().uuid('booking_id must be a UUID'),
    membership_tier:  z.undefined(),
  }),
  z.object({
    booking_id:       z.undefined(),
    membership_tier:  z.enum(['silver', 'gold', 'platinum', 'obsidian']),
  }),
]).transform((data) => data);

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  const { user } = auth;

  // Rate limit by user ID.
  const rateLimitError = await assertRateLimit('payments:create', user.id);
  if (rateLimitError) return rateLimitError;

  // CSRF check.
  const csrfError = assertCsrf(request, user.id);
  if (csrfError) return csrfError;

  const parsed = await parseBody(request, createOrderSchema);
  if ('error' in parsed) return parsed.error;

  const bookingId = parsed.data.booking_id;
  const membershipTier = parsed.data.membership_tier;

  const db = createServiceRoleClient();

  let amountPaise: number;
  let receiptId:   string;
  let paymentType: 'booking' | 'membership';
  let dbBookingId: string | null = null;
  let dbMembershipId: string | null = null;

  try {
    if (bookingId) {
      // --- Booking payment ---
      const { data: booking, error: bookingError } = await db
        .from('bookings')
        .select('id, booking_ref, status, total_paise, user_id')
        .eq('id', bookingId)
        .single();

      if (bookingError || !booking) {
        return apiError('Booking not found.', 404);
      }

      const b = booking as Record<string, unknown>;

      // Verify ownership.
      if (b.user_id !== user.id) {
        return apiError('Forbidden.', 403);
      }

      // Must be in pending state.
      if (b.status !== 'pending') {
        return apiError(
          `Cannot create payment for a booking with status '${b.status}'.`,
          409
        );
      }

      amountPaise  = b.total_paise as number;
      receiptId    = b.booking_ref as string;
      paymentType  = 'booking';
      dbBookingId  = bookingId;

      // Idempotency: return existing order if one already exists for this booking.
      const { data: existingPayment } = await db
        .from('payments')
        .select('id, provider_order_id, amount_paise, provider')
        .eq('booking_id', bookingId)
        .eq('status', 'created')
        .maybeSingle();

      if (existingPayment) {
        const ep = existingPayment as Record<string, unknown>;
        return apiSuccess({
          order_id:    ep.provider_order_id,
          amount:      ep.amount_paise,
          currency:    'INR',
          provider:    ep.provider,
          booking_ref: receiptId,
        });
      }

    } else {
      // --- Membership payment ---
      const { data: plan, error: planError } = await db
        .from('membership_plans')
        .select('id, price_paise, slug, name')
        .eq('slug', membershipTier!)
        .eq('is_active', true)
        .single();

      if (planError || !plan) {
        return apiError(`Membership tier '${membershipTier}' not found.`, 404);
      }

      const p = plan as Record<string, unknown>;

      const { data: membership, error: membershipError } = await db
        .from('memberships')
        .select('id, status, referral_code')
        .eq('user_id', user.id)
        .eq('plan_id', p.id as string)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (membershipError) {
        console.error('[POST /api/payments/create-order] Membership lookup error:', membershipError.message);
        return apiError('Failed to find pending membership.', 500);
      }

      if (!membership) {
        return apiError('Create a pending membership before payment.', 409);
      }

      const m = membership as Record<string, unknown>;
      dbMembershipId = m.id as string;
      amountPaise    = p.price_paise as number;
      receiptId      = `MEMB-${membershipTier!.toUpperCase()}-${user.id.slice(0, 8).toUpperCase()}`;
      paymentType    = 'membership';

      const { data: existingPayment } = await db
        .from('payments')
        .select('id, provider_order_id, amount_paise, provider')
        .eq('membership_id', dbMembershipId)
        .eq('status', 'created')
        .maybeSingle();

      if (existingPayment) {
        const ep = existingPayment as Record<string, unknown>;
        return apiSuccess({
          order_id: ep.provider_order_id,
          amount: ep.amount_paise,
          currency: 'INR',
          provider: ep.provider,
          booking_ref: receiptId,
        });
      }
    }

    // Get active payment provider.
    let provider;
    try {
      provider = await getPaymentProvider();
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        return apiError(
          'Payment gateway is not configured. Please contact admin.',
          503
        );
      }
      throw err;
    }

    // Create order via provider.
    const order = await provider.createOrder({
      amountPaise,
      currency:  'INR',
      receiptId,
      notes: {
        user_id: user.id,
        payment_type: paymentType,
        ...(dbMembershipId ? { membership_id: dbMembershipId } : {}),
      },
    });

    // Generate idempotency key.
    const idempotencyKey = hashToken(
      `${user.id}:${dbBookingId ?? dbMembershipId}:${order.orderId}`
    );

    // Persist payment record.
    const { data: payment, error: paymentInsertError } = await db
      .from('payments')
      .insert({
        booking_id:        dbBookingId,
        membership_id:     dbMembershipId,
        user_id:           user.id,
        payment_type:      paymentType,
        status:            'created',
        amount_paise:      amountPaise,
        currency:          'INR',
        provider:          provider.name,
        provider_order_id: order.orderId,
        idempotency_key:   idempotencyKey,
        metadata:          { receipt_id: receiptId, raw_order: order.raw, membership_tier: membershipTier ?? null },
      })
      .select('id')
      .single();

    if (paymentInsertError) {
      console.error('[POST /api/payments/create-order] Payment insert error:', paymentInsertError.message);
      return apiError('Failed to persist payment order. Please try again.', 500);
    }

    const ip = getClientIP(request);
    await logAudit({
      action:      'payment.verified',
      actor_type:  'member',
      actor_id:    user.id,
      target_type: paymentType,
      target_id:   dbBookingId ?? dbMembershipId ?? undefined,
      details:     {
        event:        'order_created',
        order_id:     order.orderId,
        amount_paise: amountPaise,
        provider:     provider.name,
        is_test_mode: provider.isTestMode,
      },
      ip_address:  ip,
    });

    return apiSuccess({
      order_id:     order.orderId,
      amount:       order.amount,
      currency:     order.currency,
      provider:     provider.name,
      is_test_mode: provider.isTestMode,
      booking_ref:  receiptId,
    });

  } catch (err) {
    console.error('[POST /api/payments/create-order] Unexpected error:', err);
    return apiError('Failed to create payment order. Please try again.', 500);
  }
}
