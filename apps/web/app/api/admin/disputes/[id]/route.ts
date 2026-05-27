/**
 * app/api/admin/disputes/[id]/route.ts
 * ---------------------------------------------------------------------------
 * PATCH /api/admin/disputes/[id] — resolve or reject a dispute
 * ---------------------------------------------------------------------------
 */

import { z }                           from 'zod';
import { apiSuccess, apiError, requireAdmin, buildAuditEntry } from '@/lib/api-helpers';
import { assertCsrf }                  from '@/lib/security/csrf';
import { createServiceRoleClient }     from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const resolveDisputeSchema = z.object({
  action:       z.enum(['resolve', 'reject']),
  resolution:   z.string().min(5, 'Resolution must be at least 5 characters.').max(2000),
  admin_notes:  z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/disputes/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdmin(request, 'disputes:resolve');
  if ('error' in auth) return auth.error;
  const { session } = auth;

  // CSRF check
  const csrfError = assertCsrf(request, session.id);
  if (csrfError) return csrfError;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid JSON in request body.', 400);
  }

  const parsed = resolveDisputeSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return apiError(first?.message ?? 'Validation failed.', 400, parsed.error.issues);
  }

  const { action, resolution, admin_notes } = parsed.data;

  try {
    const db = createServiceRoleClient();

    // Verify dispute exists and is not already resolved
    const { data: dispute, error: fetchError } = await db
      .from('payment_disputes')
      .select('id, status, booking_id, payment_id, user_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !dispute) {
      return apiError('Dispute not found.', 404);
    }

    if (dispute.status === 'resolved' || dispute.status === 'rejected') {
      return apiError(`Dispute is already ${dispute.status}.`, 400);
    }

    const newStatus = action === 'resolve' ? 'resolved' : 'rejected';

    const { error: updateError } = await db
      .from('payment_disputes')
      .update({
        status:               newStatus,
        resolution,
        admin_notes:          admin_notes ?? null,
        resolved_by_admin_id: session.adminUserId,
        resolved_at:          new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('[admin/disputes/[id]] update error:', updateError.message);
      return apiError('Failed to update dispute.', 500);
    }

    // If resolved: create a refund record if the dispute warrants one
    // TODO: AI — Use fraud scoring model to auto-flag suspicious dispute patterns
    if (action === 'resolve' && dispute.payment_id) {
      // Fetch the payment to get the amount
      const { data: payment } = await db
        .from('payments')
        .select('id, amount_paise, user_id, booking_id')
        .eq('id', dispute.payment_id)
        .maybeSingle();

      if (payment) {
        // Insert a refund record in 'requested' state for admin to approve separately
        await db.from('refunds').insert({
          payment_id:    dispute.payment_id,
          user_id:       dispute.user_id,
          booking_id:    dispute.booking_id,
          status:        'requested',
          amount_paise:  payment.amount_paise,
          reason:        `Dispute resolution: ${resolution}`,
          admin_notes:   `Auto-created from dispute ${id}`,
        });
      }
    }

    await db.from('audit_logs').insert(
      buildAuditEntry({
        action:     `dispute.${newStatus}`,
        actorType:  'admin',
        actorId:    session.adminUserId,
        targetType: 'payment_disputes',
        targetId:   id,
        details:    { action, resolution, admin_notes },
        request,
      })
    );

    return apiSuccess({
      dispute_id: id,
      status:     newStatus,
      message:    `Dispute ${newStatus} successfully.`,
    });
  } catch (err) {
    console.error('[admin/disputes/[id]] unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
