/**
 * GET  /api/deals  — public (active deals only) or admin (all statuses)
 * POST /api/deals  — admin only, create a new deal
 *
 * Tier gating for GET:
 *   - Unauthenticated callers: silver-accessible deals only
 *   - Authenticated members:   deals up to their tier
 *   - Admin:                   all deals regardless of tier or status
 */

import { parseBody, requireAdmin, requireAuth, apiSuccess, apiError, getPagination } from '@/lib/api-helpers';
import { assertRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { assertCsrf }                   from '@/lib/security/csrf';
import { createServiceRoleClient }      from '@/lib/supabase/service';
import { createClient }                 from '@/lib/supabase/server';
import { createDealSchema }             from '@/lib/validations';
import { logAudit }                     from '@/lib/audit';
import type { Tier }                    from '@/lib/types';

const TIER_RANK: Record<string, number> = {
  silver:   1,
  gold:     2,
  platinum: 3,
  obsidian: 4,
};

// ---------------------------------------------------------------------------
// GET /api/deals
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  // Rate limit for public endpoint
  const ip = getClientIP(request);
  const rateLimitError = await assertRateLimit('api:public', ip);
  if (rateLimitError) return rateLimitError;

  const { searchParams } = new URL(request.url);
  const category   = searchParams.get('category');
  const minSavings = searchParams.get('minSavings');
  const statusParam = searchParams.get('status');
  const search     = searchParams.get('q');
  const { limit, offset, page } = getPagination(searchParams);

  // Determine caller's access level.
  let callerIsAdmin   = false;
  let callerTierRank  = 1; // default: silver only for unauthenticated

  // Try admin auth.
  const adminAuth = await requireAdmin(request, 'deals:read');
  if (!('error' in adminAuth)) {
    callerIsAdmin = true;
  } else {
    // Try member auth (optional — not required for public deal browsing).
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get member's tier from their active membership.
        const db = createServiceRoleClient();
        const { data: membership } = await db
          .from('memberships')
          .select('membership_plans ( slug )')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (membership) {
          const plans = Array.isArray(membership.membership_plans)
            ? membership.membership_plans
            : [membership.membership_plans];
          const slug = (plans[0] as Record<string, unknown> | null)?.slug as string | undefined;
          callerTierRank = TIER_RANK[slug ?? 'silver'] ?? 1;
        }
      }
    } catch {
      // Not authenticated — proceed with silver-only access.
    }
  }

  const db = createServiceRoleClient();

  try {
    // Build base query.
    let query = db
      .from('deals')
      .select(
        `
          id,
          title,
          brand,
          description,
          category,
          club_price_paise,
          retail_price_paise,
          savings_pct,
          min_tier,
          status,
          valid_from,
          valid_until,
          max_bookings,
          current_bookings,
          token_earn_multiplier,
          image_url,
          created_at,
          updated_at
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Status filter: admin sees all by default, public sees only 'active'.
    if (callerIsAdmin) {
      if (statusParam && statusParam !== 'all') {
        query = query.eq('status', statusParam);
      }
    } else {
      query = query.eq('status', 'active');
      // Only show deals whose validity window includes now.
      const now = new Date().toISOString();
      query = query
        .or(`valid_until.is.null,valid_until.gte.${now}`)
        .or(`valid_from.is.null,valid_from.lte.${now}`);
    }

    // Category filter.
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    // Min savings filter.
    if (minSavings) {
      const pct = parseFloat(minSavings);
      if (!isNaN(pct)) query = query.gte('savings_pct', pct);
    }

    // Text search on title / brand / description.
    if (search) {
      query = query.or(
        `title.ilike.%${search}%,brand.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/deals] DB error:', error.message);
      return apiError('Failed to fetch deals.', 500);
    }

    // Tier filter: members only see deals at their tier or below.
    const deals = (data ?? []).filter((d) => {
      if (callerIsAdmin) return true;
      const dealRank = TIER_RANK[d.min_tier as string] ?? 1;
      return dealRank <= callerTierRank;
    });

    // TODO: AI — personalised deal feed injection point.
    // Ranked deals from lib/ai/recommendations.ts will be merged here for
    // authenticated members. See docs/AI_ROADMAP.md for interface contract.

    return apiSuccess({
      deals,
      total:  count ?? 0,
      page,
      limit,
      pages:  Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    console.error('[GET /api/deals] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/deals
// Admin only.
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, 'deals:write');
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const csrfError = assertCsrf(request, session.id);
  if (csrfError) return csrfError;

  const parsed = await parseBody(request, createDealSchema);
  if ('error' in parsed) return parsed.error;

  const {
    title, category, brand, description,
    club_price, retail_price, min_tier,
    expires_at, max_bookings,
  } = parsed.data;

  // Validate price relationship.
  if (retail_price > 0 && club_price >= retail_price) {
    return apiError('club_price must be less than retail_price.', 400);
  }

  const savings_pct =
    retail_price > 0
      ? parseFloat(((retail_price - club_price) / retail_price * 100).toFixed(2))
      : 0;

  const db = createServiceRoleClient();

  try {
    const { data, error } = await db
      .from('deals')
      .insert({
        title,
        category,
        brand:                  brand ?? '',
        description:            description ?? null,
        club_price_paise:       club_price,
        retail_price_paise:     retail_price,
        savings_pct,
        min_tier,
        status:                 'draft',
        valid_until:            expires_at,
        max_bookings:           max_bookings ?? null,
        current_bookings:       0,
        token_earn_multiplier:  1.0,
        created_by_admin_id:    session.adminUserId,
      })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/deals] DB insert error:', error.message);
      return apiError('Failed to create deal.', 500);
    }

    await logAudit({
      action:      'deal.created',
      actor_type:  'admin',
      actor_id:    session.adminUserId,
      target_type: 'deal',
      target_id:   (data as Record<string, unknown>).id as string,
      details:     { title, category, min_tier, savings_pct },
    });

    return apiSuccess({ deal: data }, 201);
  } catch (err) {
    console.error('[POST /api/deals] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}
