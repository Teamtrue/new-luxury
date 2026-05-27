/**
 * GET  /api/tokens  — member's token transaction history + current balance
 * POST /api/tokens  — admin: credit or debit tokens for a member
 */

import { parseBody, requireAuth, requireAdmin, apiSuccess, apiError, getPagination } from '@/lib/api-helpers';
import { assertCsrf }              from '@/lib/security/csrf';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit }                from '@/lib/audit';
import { z }                        from 'zod';

// ---------------------------------------------------------------------------
// GET /api/tokens
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(request.url);
  const typeFilter = searchParams.get('type');
  const { limit, offset, page } = getPagination(searchParams);

  const db = createServiceRoleClient();

  try {
    // Fetch all transactions to compute balance accurately.
    // Then apply pagination to the transactions list.
    const { data: allRows } = await db
      .from('token_transactions')
      .select('amount')
      .eq('user_id', user.id);

    const balance = (allRows ?? []).reduce(
      (sum: number, row: { amount: number }) => sum + row.amount,
      0
    );

    // Fetch paginated transactions with filter.
    let query = db
      .from('token_transactions')
      .select(
        `
          id,
          type,
          amount,
          balance_after,
          reference_type,
          reference_id,
          description,
          created_at
        `,
        { count: 'exact' }
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (typeFilter && typeFilter !== 'all') {
      query = query.eq('type', typeFilter);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/tokens] DB error:', error.message);
      return apiError('Failed to fetch token transactions.', 500);
    }

    return apiSuccess({
      balance,
      transactions: data ?? [],
      total:        count ?? 0,
      page,
      limit,
      pages:        Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    console.error('[GET /api/tokens] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/tokens
// Admin only — manual token adjustment.
// ---------------------------------------------------------------------------

const adminTokenSchema = z.object({
  user_id:        z.string().uuid('user_id must be a valid UUID'),
  type:           z.enum(['bonus', 'adjusted', 'expired']),
  amount:         z.number().int().refine((n) => n !== 0, 'amount cannot be zero'),
  description:    z.string().min(3).max(500),
  reference_id:   z.string().uuid().optional(),
  reference_type: z.enum(['booking', 'referral', 'welcome', 'admin', 'expiry']).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, 'members:write');
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const csrfError = assertCsrf(request, session.id);
  if (csrfError) return csrfError;

  const parsed = await parseBody(request, adminTokenSchema);
  if ('error' in parsed) return parsed.error;

  const { user_id, type, amount, description, reference_id, reference_type } = parsed.data;

  const db = createServiceRoleClient();

  try {
    // Verify target member exists.
    const { data: profile, error: profileError } = await db
      .from('user_profiles')
      .select('id')
      .eq('id', user_id)
      .single();

    if (profileError || !profile) {
      return apiError('Member not found.', 404);
    }

    // Compute current balance.
    const { data: allRows } = await db
      .from('token_transactions')
      .select('amount')
      .eq('user_id', user_id);

    const currentBalance = (allRows ?? []).reduce(
      (sum: number, row: { amount: number }) => sum + row.amount,
      0
    );

    const balanceAfter = currentBalance + amount;

    // Prevent balance going negative (unless admin explicitly debits).
    if (balanceAfter < 0) {
      return apiError(
        `Adjustment would result in a negative balance (current: ${currentBalance}, adjustment: ${amount}).`,
        400
      );
    }

    // Insert transaction.
    const { data: txn, error: txnError } = await db
      .from('token_transactions')
      .insert({
        user_id,
        type,
        amount,
        balance_after:  balanceAfter,
        reference_type: reference_type ?? 'admin',
        reference_id:   reference_id ?? null,
        description,
      })
      .select()
      .single();

    if (txnError) {
      console.error('[POST /api/tokens] Insert error:', txnError.message);
      return apiError('Failed to record token adjustment.', 500);
    }

    await logAudit({
      action:      'member.tokens_adjusted',
      actor_type:  'admin',
      actor_id:    session.adminUserId,
      target_type: 'member',
      target_id:   user_id,
      details:     {
        type,
        amount,
        balance_before: currentBalance,
        balance_after:  balanceAfter,
        description,
      },
    });

    return apiSuccess({ transaction: txn, balance_after: balanceAfter }, 201);
  } catch (err) {
    console.error('[POST /api/tokens] Unexpected error:', err);
    return apiError('Internal server error.', 500);
  }
}
