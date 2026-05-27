/**
 * app/api/admin/refunds/[id]/route.ts
 * ---------------------------------------------------------------------------
 * POST /api/admin/refunds/[id]/approve — approve and process a refund
 *
 * Note: The "approve" sub-action is handled here by detecting the URL path.
 * The Next.js segment is /[id] but the caller hits /[id]/approve as a POST.
 * That sub-path is handled by the nested route at [id]/approve/route.ts.
 * This file handles a bare PATCH on /[id] for status-only updates.
 * ---------------------------------------------------------------------------
 */

import { z }                           from 'zod';
import { apiSuccess, apiError, requireAdmin, buildAuditEntry } from '@/lib/api-helpers';
import { assertCsrf }                  from '@/lib/security/csrf';
import { createServiceRoleClient }     from '@/lib/supabase/service';
import { getPaymentProvider }          from '@/lib/providers';

// ---------------------------------------------------------------------------
// PATCH /api/admin/refunds/[id] — update admin_notes or reject
// ---------------------------------------------------------------------------

const patchRefundSchema = z.object({
  status:      z.enum(['rejected']).optional(),
  admin_notes: z.string().max(2000).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdmin(request, 'refunds:approve');
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const csrfError = assertCsrf(request, session.id);
  if (csrfError) return csrfError;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid JSON in request body.', 400);
  }

  const parsed = patchRefundSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return apiError(first?.message ?? 'Validation failed.', 400, parsed.error.issues);
  }

  const { status, admin_notes } = parsed.data;

  try {
    const db = createServiceRoleClient();

    const { data: refund, error: fetchError } = await db
      .from('refunds')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !refund) {
      return apiError('Refund not found.', 404);
    }

    if (refund.status === 'paid' || refund.status === 'processing') {
      return apiError(`Cannot modify a refund in '${refund.status}' state.`, 400);
    }

    const updatePayload: Record<string, unknown> = {};
    if (status)      updatePayload.status      = status;
    if (admin_notes) updatePayload.admin_notes  = admin_notes;

    if (Object.keys(updatePayload).length === 0) {
      return apiError('No fields to update.', 400);
    }

    const { error: updateError } = await db
      .from('refunds')
      .update(updatePayload)
      .eq('id', id);

    if (updateError) {
      console.error('[admin/refunds/[id]] PATCH update error:', updateError.message);
      return apiError('Failed to update refund.', 500);
    }

    await db.from('audit_logs').insert(
      buildAuditEntry({
        action:     'refund.updated',
        actorType:  'admin',
        actorId:    session.adminUserId,
        targetType: 'refund',
        targetId:   id,
        details:    { updated_fields: Object.keys(updatePayload) },
        request,
      })
    );

    return apiSuccess({ refund_id: id, message: 'Refund updated.' });
  } catch (err) {
    console.error('[admin/refunds/[id]] PATCH unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/refunds/[id] — approve and trigger payment provider refund
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdmin(request, 'refunds:approve');
  if ('error' in auth) return auth.error;
  const { session } = auth;

  // Only process if path ends with /approve
  const url     = new URL(request.url);
  const pathEnd = url.pathname.split('/').pop();
  if (pathEnd !== 'approve') {
    return apiError('Unknown sub-action.', 404);
  }

  const csrfError = assertCsrf(request, session.id);
  if (csrfError) return csrfError;

  const { id } = await params;

  try {
    const db = createServiceRoleClient();

    // Fetch refund + payment details
    const { data: refund, error: fetchError } = await db
      .from('refunds')
      .select(`
        id, status, amount_paise, reason,
        payments!refunds_payment_id_fkey ( id, provider_payment_id, amount_paise )
      `)
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !refund) {
      return apiError('Refund not found.', 404);
    }

    if (refund.status !== 'requested' && refund.status !== 'approved') {
      return apiError(`Refund is in '${refund.status}' state and cannot be approved now.`, 400);
    }

    // Mark as approved first
    await db
      .from('refunds')
      .update({ status: 'approved', processed_by_admin_id: session.adminUserId })
      .eq('id', id);

    // Attempt to process via payment provider
    const payment = Array.isArray(refund.payments) ? refund.payments[0] : refund.payments;
    const providerPaymentId = (payment as { provider_payment_id?: string })?.provider_payment_id;

    let providerRefundId: string | null = null;
    let finalStatus: string = 'approved';

    if (providerPaymentId) {
      try {
        const provider = await getPaymentProvider();
        const refundResult = await provider.processRefund({
          providerPaymentId,
          amountPaise: refund.amount_paise as number,
          reason:      (refund.reason as string) ?? 'Admin approved refund',
        });
        providerRefundId = refundResult.providerRefundId;
        finalStatus = 'processing';
      } catch (providerErr) {
        console.error('[admin/refunds/[id]] provider processRefund error:', providerErr);
        // Don't fail the route — just flag for manual follow-up
        finalStatus = 'approved';
      }
    }

    // Update with provider refund ID and new status
    await db
      .from('refunds')
      .update({
        status:              finalStatus,
        provider_refund_id:  providerRefundId,
        processed_at:        new Date().toISOString(),
        processed_by_admin_id: session.adminUserId,
      })
      .eq('id', id);

    await db.from('audit_logs').insert(
      buildAuditEntry({
        action:     'refund.approved',
        actorType:  'admin',
        actorId:    session.adminUserId,
        targetType: 'refund',
        targetId:   id,
        details:    {
          amount_paise:       refund.amount_paise,
          provider_refund_id: providerRefundId,
          status:             finalStatus,
        },
        request,
      })
    );

    return apiSuccess({
      refund_id:          id,
      status:             finalStatus,
      provider_refund_id: providerRefundId,
      message:            'Refund approved and submitted to payment provider.',
    });
  } catch (err) {
    console.error('[admin/refunds/[id]] POST unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
