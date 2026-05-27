/**
 * app/api/admin/deals/route.ts
 * ---------------------------------------------------------------------------
 * GET  /api/admin/deals — list all deals with admin filters
 * POST /api/admin/deals — create a new deal (status='draft')
 * ---------------------------------------------------------------------------
 */

import { z }                           from 'zod';
import { apiSuccess, apiError, requireAdmin, buildAuditEntry, getPagination } from '@/lib/api-helpers';
import { assertCsrf }                  from '@/lib/security/csrf';
import { createServiceRoleClient }     from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// GET /api/admin/deals
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, 'deals:read');
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const { page, limit, offset } = getPagination(searchParams);

  const statusFilter   = searchParams.get('status');
  const categoryFilter = searchParams.get('category');
  const tierFilter     = searchParams.get('min_tier');
  const search         = searchParams.get('search');

  try {
    const db = createServiceRoleClient();

    let query = db
      .from('deals')
      .select(
        `
        id,
        title,
        brand,
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
        commission_pct,
        partner_name,
        partner_contact_email,
        image_url,
        created_at,
        updated_at
        `,
        { count: 'exact' }
      );

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }
    if (categoryFilter) {
      query = query.eq('category', categoryFilter);
    }
    if (tierFilter) {
      query = query.eq('min_tier', tierFilter);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,brand.ilike.%${search}%,partner_name.ilike.%${search}%`);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[admin/deals] GET query error:', error.message);
      return apiError('Failed to fetch deals.', 500);
    }

    return apiSuccess({
      deals: data ?? [],
      pagination: {
        page,
        limit,
        total:       count ?? 0,
        total_pages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    console.error('[admin/deals] GET unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/deals
// ---------------------------------------------------------------------------

const createDealSchema = z.object({
  title:                 z.string().min(3).max(200),
  brand:                 z.string().min(1).max(100),
  category:              z.string().min(1),
  description:           z.string().max(5000).optional(),
  terms_and_conditions:  z.string().max(5000).optional(),
  club_price_paise:      z.number().int().positive('Club price must be positive.'),
  retail_price_paise:    z.number().int().positive('Retail price must be positive.'),
  min_tier:              z.enum(['silver', 'gold', 'platinum', 'obsidian']).default('silver'),
  valid_from:            z.string().datetime().optional(),
  valid_until:           z.string().datetime().optional(),
  max_bookings:          z.number().int().positive().optional(),
  token_earn_multiplier: z.number().min(0.1).max(10).default(1),
  commission_pct:        z.number().min(0).max(100).default(3),
  partner_name:          z.string().max(200).optional(),
  partner_contact_email: z.string().email().optional(),
  image_url:             z.string().url().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, 'deals:write');
  if ('error' in auth) return auth.error;
  const { session } = auth;

  // CSRF check
  const csrfError = assertCsrf(request, session.id);
  if (csrfError) return csrfError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid JSON in request body.', 400);
  }

  const parsed = createDealSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return apiError(first?.message ?? 'Validation failed.', 400, parsed.error.issues);
  }

  const dealData = parsed.data;

  // Compute savings_pct
  const savings_pct =
    dealData.retail_price_paise > 0
      ? ((dealData.retail_price_paise - dealData.club_price_paise) /
          dealData.retail_price_paise) *
        100
      : 0;

  try {
    const db = createServiceRoleClient();

    const { data: newDeal, error: insertError } = await db
      .from('deals')
      .insert({
        ...dealData,
        savings_pct:          Math.max(0, savings_pct),
        status:               'draft',
        created_by_admin_id:  session.adminUserId,
      })
      .select('id, title, status')
      .single();

    if (insertError) {
      console.error('[admin/deals] POST insert error:', insertError.message);
      return apiError('Failed to create deal.', 500);
    }

    await db.from('audit_logs').insert(
      buildAuditEntry({
        action:     'deal.created',
        actorType:  'admin',
        actorId:    session.adminUserId,
        targetType: 'deal',
        targetId:   newDeal.id,
        details:    { title: dealData.title, status: 'draft' },
        request,
      })
    );

    return apiSuccess(newDeal, 201);
  } catch (err) {
    console.error('[admin/deals] POST unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
