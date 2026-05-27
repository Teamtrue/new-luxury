/**
 * app/api/admin/members/route.ts
 * ---------------------------------------------------------------------------
 * GET /api/admin/members — paginated, filterable member list for admin console.
 * ---------------------------------------------------------------------------
 */

import { apiSuccess, apiError, requireAdmin, getPagination } from '@/lib/api-helpers';
import { createServiceRoleClient } from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// GET /api/admin/members
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, 'members:read');
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const { page, limit, offset } = getPagination(searchParams);

  // Filters
  const tier        = searchParams.get('tier');         // silver|gold|platinum|obsidian
  const status      = searchParams.get('status');       // active|expired|suspended|cancelled|pending
  const search      = searchParams.get('search');       // name / email / phone
  const joinedAfter = searchParams.get('joined_after'); // ISO date
  const joinedBefore = searchParams.get('joined_before');
  const sortBy      = searchParams.get('sort') ?? 'joined_at';
  const sortDir     = searchParams.get('dir') === 'asc' ? true : false; // ascending?

  try {
    const db = createServiceRoleClient();

    // Base query: join user_profiles with memberships and membership_plans.
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
          auto_renew,
          referral_code,
          renewal_count,
          membership_plans ( name, slug )
        )
        `,
        { count: 'exact' }
      );

    // Apply membership tier filter (join through memberships → membership_plans.slug)
    if (tier) {
      query = query.eq('memberships.membership_plans.slug', tier);
    }
    if (status) {
      query = query.eq('memberships.status', status);
    }
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    if (joinedAfter) {
      query = query.gte('created_at', joinedAfter);
    }
    if (joinedBefore) {
      query = query.lte('created_at', joinedBefore);
    }

    // Sort
    const validSortColumns: Record<string, string> = {
      joined_at: 'created_at',
      name:      'full_name',
    };
    const dbSortColumn = validSortColumns[sortBy] ?? 'created_at';
    query = query.order(dbSortColumn, { ascending: sortDir }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[admin/members] GET query error:', error.message);
      return apiError('Failed to fetch members.', 500);
    }

    const totalPages = Math.ceil((count ?? 0) / limit);

    return apiSuccess({
      members: data ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        total_pages: totalPages,
      },
    });
  } catch (err) {
    console.error('[admin/members] GET unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
