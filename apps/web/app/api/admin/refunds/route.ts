/**
 * app/api/admin/refunds/route.ts
 * ---------------------------------------------------------------------------
 * GET /api/admin/refunds — list all refunds with payment + booking info
 * ---------------------------------------------------------------------------
 */

import { apiSuccess, apiError, requireAdmin, getPagination } from '@/lib/api-helpers';
import { createServiceRoleClient } from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// GET /api/admin/refunds
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, 'refunds:read');
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const { page, limit, offset } = getPagination(searchParams);
  const statusFilter = searchParams.get('status');

  try {
    const db = createServiceRoleClient();

    let query = db
      .from('refunds')
      .select(
        `
        id,
        status,
        amount_paise,
        reason,
        admin_notes,
        provider_refund_id,
        processed_at,
        created_at,
        updated_at,
        user_profiles!refunds_user_id_fkey ( id, full_name, phone ),
        payments!refunds_payment_id_fkey ( id, provider, provider_payment_id, provider_order_id, amount_paise, status ),
        bookings!refunds_booking_id_fkey ( id, booking_ref, total_paise, status )
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
      console.error('[admin/refunds] GET query error:', error.message);
      return apiError('Failed to fetch refunds.', 500);
    }

    return apiSuccess({
      refunds: data ?? [],
      pagination: {
        page,
        limit,
        total:       count ?? 0,
        total_pages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    console.error('[admin/refunds] GET unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
