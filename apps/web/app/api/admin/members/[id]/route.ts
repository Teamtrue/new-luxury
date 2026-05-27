/**
 * app/api/admin/members/[id]/route.ts
 * ---------------------------------------------------------------------------
 * GET   /api/admin/members/[id] — full member profile (admin view)
 * PATCH /api/admin/members/[id] — update tier / status / notes
 * ---------------------------------------------------------------------------
 */

import { z }                           from 'zod';
import { apiSuccess, apiError, requireAdmin, buildAuditEntry } from '@/lib/api-helpers';
import { assertCsrf }                  from '@/lib/security/csrf';
import { createServiceRoleClient }     from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// GET /api/admin/members/[id]
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdmin(request, 'members:read');
  if ('error' in auth) return auth.error;

  const { id } = await params;

  try {
    const db = createServiceRoleClient();

    // Full profile: user_profiles + memberships
    const { data: profile, error: profileError } = await db
      .from('user_profiles')
      .select(`
        id,
        full_name,
        phone,
        phone_verified,
        avatar_url,
        created_at,
        updated_at,
        memberships (
          id,
          status,
          started_at,
          expires_at,
          auto_renew,
          referral_code,
          renewal_count,
          membership_plans ( id, name, slug, price_paise, has_concierge, has_relationship_manager )
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (profileError) {
      console.error('[admin/members/[id]] GET profile error:', profileError.message);
      return apiError('Failed to fetch member.', 500);
    }
    if (!profile) {
      return apiError('Member not found.', 404);
    }

    // Last 5 bookings
    const { data: bookings } = await db
      .from('bookings')
      .select('id, booking_ref, status, total_paise, tokens_used, tokens_earned, created_at, deals ( title, brand )')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(5);

    // Token balance (sum of all transactions)
    const { data: tokenSum } = await db
      .from('token_transactions')
      .select('amount')
      .eq('user_id', id);

    const tokenBalance = (tokenSum ?? []).reduce(
      (acc: number, tx: { amount: number }) => acc + tx.amount, 0
    );

    // Referral count
    const { count: referralCount } = await db
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_user_id', id);

    return apiSuccess({
      ...profile,
      recent_bookings: bookings ?? [],
      token_balance:   tokenBalance,
      referral_count:  referralCount ?? 0,
    });
  } catch (err) {
    console.error('[admin/members/[id]] GET unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/members/[id]
// ---------------------------------------------------------------------------

const patchMemberSchema = z.object({
  tier:   z.enum(['silver', 'gold', 'platinum', 'obsidian']).optional(),
  status: z.enum(['active', 'expired', 'suspended', 'cancelled']).optional(),
  notes:  z.string().max(2000).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdmin(request, 'members:write');
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

  const parsed = patchMemberSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return apiError(first?.message ?? 'Validation failed.', 400, parsed.error.issues);
  }

  const { tier, status, notes } = parsed.data;

  if (!tier && !status && !notes) {
    return apiError('At least one field (tier, status, notes) must be provided.', 400);
  }

  try {
    const db = createServiceRoleClient();

    // Verify member exists
    const { data: profile, error: profileError } = await db
      .from('user_profiles')
      .select('id, full_name')
      .eq('id', id)
      .maybeSingle();

    if (profileError || !profile) {
      return apiError('Member not found.', 404);
    }

    // Handle tier change: find the membership and look up the new plan_id
    if (tier) {
      const { data: plan, error: planError } = await db
        .from('membership_plans')
        .select('id')
        .eq('slug', tier)
        .maybeSingle();

      if (planError || !plan) {
        return apiError(`Membership plan '${tier}' not found.`, 404);
      }

      const { error: tierError } = await db
        .from('memberships')
        .update({ plan_id: plan.id, updated_at: new Date().toISOString() })
        .eq('user_id', id);

      if (tierError) {
        console.error('[admin/members/[id]] tier update error:', tierError.message);
        return apiError('Failed to update member tier.', 500);
      }

      await db.from('audit_logs').insert(
        buildAuditEntry({
          action:     'member.tier_changed',
          actorType:  'admin',
          actorId:    session.adminUserId,
          targetType: 'membership',
          targetId:   id,
          details:    { new_tier: tier, member_id: id },
          request,
        })
      );
    }

    // Handle status change
    if (status) {
      const { error: statusError } = await db
        .from('memberships')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('user_id', id);

      if (statusError) {
        console.error('[admin/members/[id]] status update error:', statusError.message);
        return apiError('Failed to update member status.', 500);
      }

      const auditAction =
        status === 'suspended' ? 'member.suspended'
        : status === 'cancelled' ? 'member.cancelled'
        : 'member.status_changed';

      await db.from('audit_logs').insert(
        buildAuditEntry({
          action:     auditAction,
          actorType:  'admin',
          actorId:    session.adminUserId,
          targetType: 'membership',
          targetId:   id,
          details:    { new_status: status, member_id: id },
          request,
        })
      );
    }

    // Handle notes (stored in user_profiles — no notes column by default in schema,
    // so we store in a metadata JSONB if it exists or log-only for now)
    // TODO: add an admin_notes column to user_profiles in a migration if needed
    if (notes) {
      await db.from('audit_logs').insert(
        buildAuditEntry({
          action:     'member.notes_updated',
          actorType:  'admin',
          actorId:    session.adminUserId,
          targetType: 'user_profiles',
          targetId:   id,
          details:    { notes },
          request,
        })
      );
    }

    return apiSuccess({ message: 'Member updated successfully.' });
  } catch (err) {
    console.error('[admin/members/[id]] PATCH unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
