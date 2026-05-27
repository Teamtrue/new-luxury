/**
 * app/api/admin/deals/[id]/route.ts
 * ---------------------------------------------------------------------------
 * PATCH  /api/admin/deals/[id] — update deal fields
 * DELETE /api/admin/deals/[id] — archive deal (soft delete)
 * ---------------------------------------------------------------------------
 */

import { z }                           from 'zod';
import { apiSuccess, apiError, requireAdmin, buildAuditEntry } from '@/lib/api-helpers';
import { assertCsrf }                  from '@/lib/security/csrf';
import { createServiceRoleClient }     from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// PATCH /api/admin/deals/[id]
// ---------------------------------------------------------------------------

const patchDealSchema = z.object({
  title:                 z.string().min(3).max(200).optional(),
  brand:                 z.string().min(1).max(100).optional(),
  category:              z.string().min(1).optional(),
  description:           z.string().max(5000).optional(),
  terms_and_conditions:  z.string().max(5000).optional(),
  club_price_paise:      z.number().int().positive().optional(),
  retail_price_paise:    z.number().int().positive().optional(),
  min_tier:              z.enum(['silver', 'gold', 'platinum', 'obsidian']).optional(),
  status:                z.enum(['draft', 'pending_review', 'active', 'expired', 'archived']).optional(),
  valid_from:            z.string().datetime().optional(),
  valid_until:           z.string().datetime().optional(),
  max_bookings:          z.number().int().positive().optional(),
  token_earn_multiplier: z.number().min(0.1).max(10).optional(),
  commission_pct:        z.number().min(0).max(100).optional(),
  partner_name:          z.string().max(200).optional(),
  partner_contact_email: z.string().email().optional(),
  image_url:             z.string().url().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  // status='active' requires deals:approve; otherwise deals:write suffices
  // We'll check approve after parsing to know which status is being set.
  const auth = await requireAdmin(request, 'deals:write');
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

  const parsed = patchDealSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return apiError(first?.message ?? 'Validation failed.', 400, parsed.error.issues);
  }

  const updates = parsed.data;

  if (Object.keys(updates).length === 0) {
    return apiError('No fields to update.', 400);
  }

  // Activating a deal requires deals:approve permission
  if (updates.status === 'active') {
    const { hasPermission } = await import('@/lib/auth/rbac');
    if (!hasPermission(session.role as import('@/lib/auth/rbac').AdminRole, 'deals:approve')) {
      return apiError(`Forbidden: your role (${session.role}) does not have the 'deals:approve' permission.`, 403);
    }
  }

  try {
    const db = createServiceRoleClient();

    // Verify deal exists
    const { data: existing, error: fetchError } = await db
      .from('deals')
      .select('id, title, status, club_price_paise, retail_price_paise')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !existing) {
      return apiError('Deal not found.', 404);
    }

    // Recompute savings_pct if prices changed
    const newClub   = updates.club_price_paise   ?? existing.club_price_paise;
    const newRetail = updates.retail_price_paise  ?? existing.retail_price_paise;
    const savings_pct = newRetail > 0
      ? ((newRetail - newClub) / newRetail) * 100
      : 0;

    const updatePayload = {
      ...updates,
      savings_pct: Math.max(0, savings_pct),
    };

    const { error: updateError } = await db
      .from('deals')
      .update(updatePayload)
      .eq('id', id);

    if (updateError) {
      console.error('[admin/deals/[id]] PATCH update error:', updateError.message);
      return apiError('Failed to update deal.', 500);
    }

    // Determine most meaningful audit action
    const auditAction =
      updates.status ? `deal.status_changed.${updates.status}`
      : (updates.club_price_paise || updates.retail_price_paise) ? 'deal.price_changed'
      : 'deal.updated';

    await db.from('audit_logs').insert(
      buildAuditEntry({
        action:     auditAction,
        actorType:  'admin',
        actorId:    session.adminUserId,
        targetType: 'deal',
        targetId:   id,
        details:    { updated_fields: Object.keys(updates) },
        request,
      })
    );

    return apiSuccess({ message: 'Deal updated successfully.', deal_id: id });
  } catch (err) {
    console.error('[admin/deals/[id]] PATCH unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/deals/[id] — soft delete (archive)
// ---------------------------------------------------------------------------

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdmin(request, 'deals:write');
  if ('error' in auth) return auth.error;
  const { session } = auth;

  // CSRF check
  const csrfError = assertCsrf(request, session.id);
  if (csrfError) return csrfError;

  const { id } = await params;

  try {
    const db = createServiceRoleClient();

    const { data: existing } = await db
      .from('deals')
      .select('id, title')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return apiError('Deal not found.', 404);
    }

    // Soft delete: set status='archived' — never hard delete
    const { error: archiveError } = await db
      .from('deals')
      .update({ status: 'archived' })
      .eq('id', id);

    if (archiveError) {
      console.error('[admin/deals/[id]] DELETE archive error:', archiveError.message);
      return apiError('Failed to archive deal.', 500);
    }

    await db.from('audit_logs').insert(
      buildAuditEntry({
        action:     'deal.archived',
        actorType:  'admin',
        actorId:    session.adminUserId,
        targetType: 'deal',
        targetId:   id,
        details:    { title: existing.title },
        request,
      })
    );

    return apiSuccess({ message: 'Deal archived successfully.', deal_id: id });
  } catch (err) {
    console.error('[admin/deals/[id]] DELETE unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
