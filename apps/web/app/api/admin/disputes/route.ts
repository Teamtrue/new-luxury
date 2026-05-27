/**
 * app/api/admin/disputes/route.ts
 * ---------------------------------------------------------------------------
 * GET /api/admin/disputes — list all disputes with user/booking/payment info
 * ---------------------------------------------------------------------------
 */

import { apiSuccess, apiError, requireAdmin, getPagination } from '@/lib/api-helpers';
import { createServiceRoleClient } from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// GET /api/admin/disputes
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, 'disputes:read');
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const { page, limit, offset } = getPagination(searchParams);
  const statusFilter = searchParams.get('status');

  try {
    const db = createServiceRoleClient();

    let query = db
      .from('payment_disputes')
      .select(
        `
        id,
        status,
        reason,
        description,
        evidence_urls,
        admin_notes,
        resolved_at,
        resolution,
        created_at,
        updated_at,
        user_profiles!payment_disputes_user_id_fkey ( id, full_name, phone ),
        bookings!payment_disputes_booking_id_fkey ( id, booking_ref, total_paise, status ),
        payments!payment_disputes_payment_id_fkey ( id, provider, provider_payment_id, amount_paise, status )
        `,
        { count: 'exact' }
      );

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[admin/disputes] GET query error:', error.message);
      return apiError('Failed to fetch disputes.', 500);
    }

    return apiSuccess({
      disputes: data ?? [],
      pagination: {
        page,
        limit,
        total:       count ?? 0,
        total_pages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    console.error('[admin/disputes] GET unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
