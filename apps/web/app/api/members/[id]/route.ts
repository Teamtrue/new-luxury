/**
 * GET   /api/members/[id]  — member gets own profile; admin gets any member
 * PATCH /api/members/[id]  — member updates own profile; admin can update more fields
 */

import { parseBody, requireAuth, requireAdmin, apiSuccess, apiError } from '@/lib/api-helpers';
import { assertCsrf }              from '@/lib/security/csrf';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { updateMemberSchema }      from '@/lib/validations';
import { logAudit }                from '@/lib/audit';
import { z }                        from 'zod';

type Params = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/members/[id]
// ---------------------------------------------------------------------------

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;

  // Try member auth first, then admin auth.
  const memberAuth = await requireAuth(request);
  const isAdmin    = 'error' in memberAuth;

  let requestorIsAdmin = false;
  if (isAdmin) {
    const adminAuth = await requireAdmin(request, 'members:read');
    if ('error' in adminAuth) {
      // Neither member nor admin — return 401.
      return memberAuth.error;
    }
    requestorIsAdmin = true;
  } else {
    // Member can only fetch their own profile.
    if (memberAuth.user.id !== id) {
      return apiError('Forbidden: you may only view your own profile.', 403);
    }
  }

  const db = createServiceRoleClient();

  try {
    const { data, error } = await db
      .from('user_profiles')
      .select(
        `
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
            referral_code,
            auto_renew,
            renewal_count,
            membership_plans (
              slug,
              name,
              token_earn_rate_pct,
              max_token_redemption_pct,
              has_concierge,
              has_relationship_manager
            )
          )
        `
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      return apiError('Member not found.', 404);
    }

    // Compute current token balance from ledger.
    const { data: tokenSum } = await db
      .from('token_transactions')
      .select('amount')
      .eq('user_id', id);

    const tokenBalance = (tokenSum ?? []).reduce(
      (sum: number, row: { amount: number }) => sum + row.amount,
      0
    );

    const memberships = Array.isArray(data.memberships)
      ? data.memberships
      : [data.memberships];
    const activeMembership =
      memberships.find((m: Record<string, unknown>) => m?.status === 'active') ??
      memberships[0] ??
      null;
    const plan = activeMembership
      ? (Array.isArray(activeMembership.membership_plans)
          ? activeMembership.membership_plans[0]
          : activeMembership.membership_plans)
      : null;

    return apiSuccess({
      id:             data.id,
      full_name:      data.full_name,
      phone:          data.phone,
      phone_verified: data.phone_verified,
      avatar_url:     data.avatar_url,
      created_at:     data.created_at,
      updated_at:     data.updated_at,
      token_balance:  tokenBalance,
      membership: activeMembership
        ? {
            id:           activeMembership.id,
            status:       activeMembership.status,
            started_at:   activeMembership.started_at,
            expires_at:   activeMembership.expires_at,
            referral_code: activeMembership.referral_code,
            auto_renew:   activeMembership.auto_renew,
            renewal_count: activeMembership.renewal_count,
            tier:         (plan as Record<string, unknown> | null)?.slug ?? null,
            tier_name:    (plan as Record<string, unknown> | null)?.name ?? null,
            has_concierge: (plan as Record<string, unknown> | null)?.has_concierge ?? false,
          }
        : null,
    });
  } catch (err) {
    console.error('[GET /api/members/[id]] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/members/[id]
// ---------------------------------------------------------------------------

const memberSelfUpdateSchema = z.object({
  full_name:  z.string().min(2).max(100).optional(),
  avatar_url: z.string().url('avatar_url must be a valid URL').optional(),
});

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;

  // Try member auth first.
  const memberAuth = await requireAuth(request);
  let requestorIsAdmin = false;
  let actorId = id;

  if ('error' in memberAuth) {
    // Not a member — check admin.
    const adminAuth = await requireAdmin(request, 'members:write');
    if ('error' in adminAuth) return memberAuth.error;
    requestorIsAdmin = true;
    actorId = adminAuth.session.adminUserId;

    // CSRF for admin mutations.
    const csrfError = assertCsrf(request, adminAuth.session.id);
    if (csrfError) return csrfError;
  } else {
    // Member can only update their own profile.
    if (memberAuth.user.id !== id) {
      return apiError('Forbidden: you may only update your own profile.', 403);
    }

    // CSRF for member mutations.
    const csrfError = assertCsrf(request, memberAuth.user.id);
    if (csrfError) return csrfError;
  }

  const db = createServiceRoleClient();

  // Ensure target member exists.
  const { data: existing, error: fetchError } = await db
    .from('user_profiles')
    .select('id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return apiError('Member not found.', 404);
  }

  if (!requestorIsAdmin) {
    // Member can only update full_name and avatar_url.
    const parsed = await parseBody(request, memberSelfUpdateSchema);
    if ('error' in parsed) return parsed.error;

    const updates: Record<string, unknown> = {};
    if (parsed.data.full_name  !== undefined) updates.full_name  = parsed.data.full_name;
    if (parsed.data.avatar_url !== undefined) updates.avatar_url = parsed.data.avatar_url;

    if (Object.keys(updates).length === 0) {
      return apiError('No updatable fields provided.', 400);
    }

    try {
      const { data: updated, error: updateError } = await db
        .from('user_profiles')
        .update(updates)
        .eq('id', id)
        .select('id, full_name, avatar_url, updated_at')
        .single();

      if (updateError) {
        console.error('[PATCH /api/members/[id]] Update error:', updateError.message);
        return apiError('Failed to update profile.', 500);
      }

      return apiSuccess(updated);
    } catch (err) {
      console.error('[PATCH /api/members/[id]] Unexpected error:', err);
      return apiError('Internal server error.', 500);
    }
  }

  // Admin update: tier, status + profile fields.
  const parsed = await parseBody(request, updateMemberSchema);
  if ('error' in parsed) return parsed.error;

  const { tier, status, name, email } = parsed.data;
  const profileUpdates: Record<string, unknown> = {};
  const membershipUpdates: Record<string, unknown> = {};

  if (name)  profileUpdates.full_name = name;
  // Note: email lives in auth.users, not user_profiles — update via admin auth API.

  if (status) membershipUpdates.status = status;

  try {
    // Update user_profiles if needed.
    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await db
        .from('user_profiles')
        .update(profileUpdates)
        .eq('id', id);

      if (profileError) {
        console.error('[PATCH /api/members/[id]] Profile update error:', profileError.message);
        return apiError('Failed to update profile.', 500);
      }
    }

    // Update tier: find and update membership plan_id.
    if (tier) {
      const { data: plan, error: planError } = await db
        .from('membership_plans')
        .select('id')
        .eq('slug', tier)
        .single();

      if (planError || !plan) {
        return apiError(`Invalid tier: ${tier}`, 400);
      }

      const { error: membershipUpdateError } = await db
        .from('memberships')
        .update({ plan_id: plan.id, ...membershipUpdates })
        .eq('user_id', id)
        .eq('status', 'active');

      if (membershipUpdateError) {
        console.error('[PATCH /api/members/[id]] Membership update error:', membershipUpdateError.message);
        return apiError('Failed to update membership.', 500);
      }
    } else if (Object.keys(membershipUpdates).length > 0) {
      const { error: membershipUpdateError } = await db
        .from('memberships')
        .update(membershipUpdates)
        .eq('user_id', id)
        .eq('status', 'active');

      if (membershipUpdateError) {
        console.error('[PATCH /api/members/[id]] Membership status update error:', membershipUpdateError.message);
        return apiError('Failed to update membership status.', 500);
      }
    }

    // Audit log for admin updates.
    await logAudit({
      action:      tier ? 'member.tier_changed' : status === 'suspended' ? 'member.suspended' : 'member.updated',
      actor_type:  'admin',
      actor_id:    actorId,
      target_type: 'member',
      target_id:   id,
      details:     { tier, status, name },
    });

    return apiSuccess({ id, updated: true, tier, status, name });
  } catch (err) {
    console.error('[PATCH /api/members/[id]] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}
