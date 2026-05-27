/**
 * GET   /api/deals/[id]  — public if active; admin sees all statuses
 * PATCH /api/deals/[id]  — admin only
 */

import { parseBody, requireAdmin, apiSuccess, apiError } from '@/lib/api-helpers';
import { assertCsrf }              from '@/lib/security/csrf';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit }                from '@/lib/audit';
import { z }                        from 'zod';

type Params = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/deals/[id]
// ---------------------------------------------------------------------------

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const db = createServiceRoleClient();

  try {
    const { data, error } = await db
      .from('deals')
      .select(
        `
          id,
          title,
          brand,
          description,
          terms_and_conditions,
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
          partner_name,
          commission_pct,
          created_at,
          updated_at
        `
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      return apiError('Deal not found.', 404);
    }

    const deal = data as Record<string, unknown>;

    // If not active, require admin auth.
    if (deal.status !== 'active') {
      const adminAuth = await requireAdmin(request, 'deals:read');
      if ('error' in adminAuth) {
        return apiError('Deal not found.', 404); // don't reveal draft/archived deals
      }
    }

    return apiSuccess({ deal });
  } catch (err) {
    console.error('[GET /api/deals/[id]] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/deals/[id]
// Admin only.
// ---------------------------------------------------------------------------

const updateDealSchema = z.object({
  title:                z.string().min(3).max(200).optional(),
  category:             z.string().min(1).optional(),
  brand:                z.string().optional(),
  description:          z.string().max(2000).optional(),
  terms_and_conditions: z.string().max(5000).optional(),
  club_price:           z.number().int().positive().optional(),
  retail_price:         z.number().int().positive().optional(),
  min_tier:             z.enum(['silver', 'gold', 'platinum', 'obsidian']).optional(),
  status:               z.enum(['draft', 'pending_review', 'active', 'expired', 'archived']).optional(),
  valid_from:           z.string().datetime().optional(),
  valid_until:          z.string().datetime().optional(),
  max_bookings:         z.number().int().positive().optional(),
  token_earn_multiplier: z.number().min(0.1).max(10).optional(),
  image_url:            z.string().url().optional(),
});

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;

  const auth = await requireAdmin(request, 'deals:write');
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const csrfError = assertCsrf(request, session.id);
  if (csrfError) return csrfError;

  const parsed = await parseBody(request, updateDealSchema);
  if ('error' in parsed) return parsed.error;

  const db = createServiceRoleClient();

  // Fetch current deal.
  const { data: existing, error: fetchError } = await db
    .from('deals')
    .select('id, status, club_price_paise, retail_price_paise, title')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return apiError('Deal not found.', 404);
  }

  const current = existing as Record<string, unknown>;

  // Build update payload.
  const updates: Record<string, unknown> = {};
  const {
    title, category, brand, description, terms_and_conditions,
    club_price, retail_price, min_tier, status,
    valid_from, valid_until, max_bookings, token_earn_multiplier, image_url,
  } = parsed.data;

  if (title !== undefined)                updates.title                = title;
  if (category !== undefined)             updates.category             = category;
  if (brand !== undefined)                updates.brand                = brand;
  if (description !== undefined)          updates.description          = description;
  if (terms_and_conditions !== undefined) updates.terms_and_conditions = terms_and_conditions;
  if (min_tier !== undefined)             updates.min_tier             = min_tier;
  if (status !== undefined)               updates.status               = status;
  if (valid_from !== undefined)           updates.valid_from           = valid_from;
  if (valid_until !== undefined)          updates.valid_until          = valid_until;
  if (max_bookings !== undefined)         updates.max_bookings         = max_bookings;
  if (token_earn_multiplier !== undefined) updates.token_earn_multiplier = token_earn_multiplier;
  if (image_url !== undefined)            updates.image_url            = image_url;

  // Prices: if either changes, recalculate savings_pct.
  const newClubPrice    = club_price    !== undefined ? club_price    : (current.club_price_paise   as number);
  const newRetailPrice  = retail_price  !== undefined ? retail_price  : (current.retail_price_paise as number);

  if (club_price !== undefined)   updates.club_price_paise   = club_price;
  if (retail_price !== undefined) updates.retail_price_paise = retail_price;

  if (club_price !== undefined || retail_price !== undefined) {
    if (newRetailPrice > 0) {
      updates.savings_pct = parseFloat(
        ((newRetailPrice - newClubPrice) / newRetailPrice * 100).toFixed(2)
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return apiError('No updatable fields provided.', 400);
  }

  try {
    const { data: updated, error: updateError } = await db
      .from('deals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[PATCH /api/deals/[id]] Update error:', updateError.message);
      return apiError('Failed to update deal.', 500);
    }

    // Determine audit action.
    let auditAction: string;
    if (status !== undefined && status !== current.status) {
      auditAction = 'deal.status_changed';
    } else if (club_price !== undefined || retail_price !== undefined) {
      auditAction = 'deal.price_changed';
    } else {
      auditAction = 'deal.updated';
    }

    await logAudit({
      action:      auditAction,
      actor_type:  'admin',
      actor_id:    session.adminUserId,
      target_type: 'deal',
      target_id:   id,
      details:     {
        changes:   updates,
        old_status: current.status,
        new_status: status,
      },
    });

    return apiSuccess({ deal: updated });
  } catch (err) {
    console.error('[PATCH /api/deals/[id]] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}
