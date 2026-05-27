/**
 * app/api/admin/members/[id]/tokens/route.ts
 * ---------------------------------------------------------------------------
 * POST /api/admin/members/[id]/tokens
 * Admin: manually credit or debit PC Tokens for a member.
 * ---------------------------------------------------------------------------
 */

import { z }                           from 'zod';
import { apiSuccess, apiError, requireAdmin, buildAuditEntry } from '@/lib/api-helpers';
import { assertCsrf }                  from '@/lib/security/csrf';
import { createServiceRoleClient }     from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const adjustTokensSchema = z.object({
  amount:      z.number().int().refine((n) => n !== 0, 'Amount cannot be zero.'),
  type:        z.enum(['bonus', 'adjusted']),
  description: z.string().min(3, 'Description must be at least 3 characters.').max(500),
});

// ---------------------------------------------------------------------------
// POST /api/admin/members/[id]/tokens
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdmin(request, 'members:write');
  if ('error' in auth) return auth.error;
  const { session } = auth;

  // CSRF check
  const csrfError = assertCsrf(request, session.id);
  if (csrfError) return csrfError;

  const { id: memberId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid JSON in request body.', 400);
  }

  const parsed = adjustTokensSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return apiError(first?.message ?? 'Validation failed.', 400, parsed.error.issues);
  }

  const { amount, type, description } = parsed.data;

  try {
    const db = createServiceRoleClient();

    // Verify member exists
    const { data: profile } = await db
      .from('user_profiles')
      .select('id')
      .eq('id', memberId)
      .maybeSingle();

    if (!profile) {
      return apiError('Member not found.', 404);
    }

    // Compute current balance (sum of all past transactions)
    const { data: txRows } = await db
      .from('token_transactions')
      .select('amount')
      .eq('user_id', memberId);

    const currentBalance = (txRows ?? []).reduce(
      (acc: number, tx: { amount: number }) => acc + tx.amount, 0
    );

    const newBalance = currentBalance + amount;

    // Reject if a debit would push balance below zero
    if (newBalance < 0) {
      return apiError(
        `Insufficient token balance. Current balance: ${currentBalance}. Requested debit: ${Math.abs(amount)}.`,
        400
      );
    }

    // Insert token transaction
    const { error: txError } = await db.from('token_transactions').insert({
      user_id:        memberId,
      type,
      amount,
      balance_after:  newBalance,
      reference_type: 'admin',
      reference_id:   null,
      description,
    });

    if (txError) {
      console.error('[admin/members/[id]/tokens] insert error:', txError.message);
      return apiError('Failed to adjust token balance.', 500);
    }

    // Audit log
    await db.from('audit_logs').insert(
      buildAuditEntry({
        action:     'member.tokens_adjusted',
        actorType:  'admin',
        actorId:    session.adminUserId,
        targetType: 'token_transactions',
        targetId:   memberId,
        details:    {
          member_id:       memberId,
          amount,
          type,
          description,
          balance_before:  currentBalance,
          balance_after:   newBalance,
        },
        request,
      })
    );

    return apiSuccess({
      member_id:      memberId,
      amount,
      type,
      balance_before: currentBalance,
      balance_after:  newBalance,
      description,
    });
  } catch (err) {
    console.error('[admin/members/[id]/tokens] unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
