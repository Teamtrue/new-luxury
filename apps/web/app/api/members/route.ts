/**
 * GET  /api/members  — admin: list all members with filters + pagination
 * POST /api/members  — public: complete member signup after OTP verification
 */

import { parseBody, requireAuth, requireAdmin, apiSuccess, apiError, getPagination } from '@/lib/api-helpers';
import { assertRateLimit, getClientIP }   from '@/lib/security/rate-limit';
import { assertCsrf }                     from '@/lib/security/csrf';
import { createServiceRoleClient }        from '@/lib/supabase/service';
import { memberSignupSchema }             from '@/lib/validations';
import { logAudit }                       from '@/lib/audit';

// ---------------------------------------------------------------------------
// GET /api/members
// Admin only — returns paginated list of user_profiles + memberships.
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, 'members:read');
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const tier   = searchParams.get('tier');
  const status = searchParams.get('status');
  const q      = searchParams.get('q');
  const { limit, offset } = getPagination(searchParams);

  const db = createServiceRoleClient();

  try {
    // Build query: user_profiles joined with latest membership.
    let query = db
      .from('user_profiles')
      .select(
        `
          id,
          full_name,
          phone,
          phone_verified,
          avatar_url,
          created_at,
          memberships (
            id,
            status,
            started_at,
            expires_at,
            referral_code,
            plan_id,
            membership_plans ( slug, name )
          )
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Text search on full_name or phone.
    if (q) {
      query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/members] DB error:', error.message);
      return apiError('Failed to fetch members.', 500);
    }

    // Flatten membership tier / status for convenience
    const members = (data ?? []).map((m) => {
      const memberships = Array.isArray(m.memberships) ? m.memberships : [m.memberships];
      const activeMembership = memberships.find((ms: Record<string, unknown>) => ms?.status === 'active') ?? memberships[0];
      const plan = activeMembership
        ? (Array.isArray(activeMembership.membership_plans)
          ? activeMembership.membership_plans[0]
          : activeMembership.membership_plans)
        : null;

      return {
        id:             m.id,
        full_name:      m.full_name,
        phone:          m.phone,
        phone_verified: m.phone_verified,
        avatar_url:     m.avatar_url,
        created_at:     m.created_at,
        tier:           (plan as Record<string, unknown> | null)?.slug ?? null,
        tier_name:      (plan as Record<string, unknown> | null)?.name ?? null,
        membership_status: activeMembership?.status ?? null,
        membership_expires: activeMembership?.expires_at ?? null,
        referral_code:  activeMembership?.referral_code ?? null,
      };
    }).filter((m) => {
      // Apply tier / status filters post-join (Supabase doesn't support nested filters cleanly here).
      if (tier && tier !== 'all' && m.tier !== tier) return false;
      if (status && status !== 'all' && m.membership_status !== status) return false;
      return true;
    });

    return apiSuccess({
      members,
      total:  count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[GET /api/members] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/members
// No auth — signup completion step (user has verified OTP, now creates profile
// and selects membership tier).
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // Rate-limit signups by IP
  const ip = getClientIP(request);
  const rateLimitError = await assertRateLimit('api:general', ip);
  if (rateLimitError) return rateLimitError;

  // Parse + validate
  const parsed = await parseBody(request, memberSignupSchema);
  if ('error' in parsed) return parsed.error;
  const { name, email, phone, tier, referred_by } = parsed.data;

  // Caller must be authenticated (OTP verified and session established).
  const authResult = await requireAuth(request);
  if ('error' in authResult) return authResult.error;
  const { user } = authResult;

  const db = createServiceRoleClient();

  try {
    // 1. Update the user_profile with name + email.
    //    Profile row was inserted during verify-otp; we upsert to be safe.
    const { error: profileError } = await db
      .from('user_profiles')
      .upsert(
        {
          id:             user.id,
          full_name:      name,
          phone:          '+91' + phone,
          phone_verified: true,
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      console.error('[POST /api/members] Profile upsert error:', profileError.message);
      return apiError('Failed to save profile. Please try again.', 500);
    }

    // 2. Find the membership plan by tier slug.
    const { data: plan, error: planError } = await db
      .from('membership_plans')
      .select('id, token_earn_rate_pct, price_paise')
      .eq('slug', tier)
      .single();

    if (planError || !plan) {
      return apiError(`Invalid membership tier: ${tier}`, 400);
    }

    // 3. Resolve referral: find referrer's membership via referral_code.
    let referrerUserId: string | null = null;
    if (referred_by) {
      const { data: referralMembership } = await db
        .from('memberships')
        .select('user_id')
        .eq('referral_code', referred_by)
        .eq('status', 'active')
        .maybeSingle();

      referrerUserId = (referralMembership?.user_id as string) ?? null;
    }

    // 4. Generate unique referral code (8 alphanumeric chars).
    const referral_code = generateReferralCode();

    // 5. Create membership record.
    const now       = new Date();
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const { data: membership, error: membershipError } = await db
      .from('memberships')
      .insert({
        user_id:              user.id,
        plan_id:              plan.id,
        status:               'pending',   // becomes 'active' after payment
        referral_code,
        referred_by_user_id:  referrerUserId,
      })
      .select('id, referral_code')
      .single();

    if (membershipError) {
      console.error('[POST /api/members] Membership insert error:', membershipError.message);
      return apiError('Failed to create membership. Please try again.', 500);
    }

    // 6. Credit welcome bonus tokens (500).
    const WELCOME_BONUS = 500;
    const { error: tokenError } = await db.from('token_transactions').insert({
      user_id:        user.id,
      type:           'bonus',
      amount:         WELCOME_BONUS,
      balance_after:  WELCOME_BONUS,
      reference_type: 'welcome',
      reference_id:   null,
      description:    'Welcome bonus — PlutusClub membership',
    });

    if (tokenError) {
      // Non-fatal: log and continue.
      console.error('[POST /api/members] Welcome token insert failed:', tokenError.message);
    }

    // 7. If referred: create referrals record + credit referee bonus.
    if (referrerUserId && membership) {
      const expiresAtRef = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      const { error: referralError } = await db.from('referrals').insert({
        referrer_user_id:         referrerUserId,
        referee_user_id:          user.id,
        referral_code:            referred_by!,
        status:                   'pending',
        referrer_token_bonus:     500,
        referee_token_bonus:      500,
        trail_commission_rate_pct: 2.00,
        expires_at:               expiresAtRef.toISOString(),
      });

      if (referralError) {
        console.error('[POST /api/members] Referral insert error:', referralError.message);
      }

      // Credit referee bonus tokens (additional 500).
      await db.from('token_transactions').insert({
        user_id:        user.id,
        type:           'bonus',
        amount:         500,
        balance_after:  WELCOME_BONUS + 500,
        reference_type: 'referral',
        reference_id:   null,
        description:    'Referral bonus — joined via referral link',
      });
    }

    // 8. Audit log
    await logAudit({
      action:      'member.created',
      actor_type:  'member',
      actor_id:    user.id,
      target_type: 'member',
      target_id:   user.id,
      details:     { tier, referred_by: referred_by ?? null },
      ip_address:  ip,
      user_agent:  request.headers.get('user-agent') ?? undefined,
    });

    return apiSuccess(
      {
        member_id:     user.id,
        referral_code: membership.referral_code,
        tier,
        welcome_tokens: WELCOME_BONUS + (referrerUserId ? 500 : 0),
      },
      201
    );
  } catch (err) {
    console.error('[POST /api/members] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function generateReferralCode(): string {
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
  const length = 8;
  let result   = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
