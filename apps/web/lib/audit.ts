/**
 * lib/audit.ts
 * ---------------------------------------------------------------------------
 * Audit log writer — writes to audit_logs table via service role.
 * ---------------------------------------------------------------------------
 */

import { createServiceRoleClient } from '@/lib/supabase/service';

export type AuditAction =
  | 'member.created'
  | 'member.updated'
  | 'member.tier_changed'
  | 'member.suspended'
  | 'member.reactivated'
  | 'member.tokens_adjusted'
  | 'member.deleted'
  | 'deal.created'
  | 'deal.updated'
  | 'deal.status_changed'
  | 'deal.price_changed'
  | 'booking.created'
  | 'booking.cancelled'
  | 'payment.verified'
  | 'payment.failed'
  | 'payment.webhook_received'
  | 'referral.created'
  | 'admin.login'
  | 'admin.logout'
  | (string & Record<never, never>);

export interface AuditEntry {
  action:       AuditAction;
  actor_type:   'member' | 'admin' | 'system';
  actor_id?:    string;
  target_type?: string;
  target_id?:   string;
  details:      Record<string, unknown>;
  ip_address?:  string;
  user_agent?:  string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  const fullEntry = {
    ...entry,
    created_at: new Date().toISOString(),
  };

  console.log('[AUDIT]', JSON.stringify(fullEntry));

  try {
    const db = createServiceRoleClient();
    const { error } = await db.from('audit_logs').insert({
      action:      fullEntry.action,
      actor_type:  fullEntry.actor_type,
      actor_id:    fullEntry.actor_id    ?? null,
      target_type: fullEntry.target_type ?? null,
      target_id:   fullEntry.target_id   ?? null,
      details:     fullEntry.details,
      ip_address:  fullEntry.ip_address  ?? null,
      user_agent:  fullEntry.user_agent  ?? null,
    });

    if (error) {
      console.error('[AUDIT] DB insert failed:', error.message, '| Entry:', JSON.stringify(fullEntry));
    }
  } catch (err) {
    console.error('[AUDIT] Unexpected error writing audit log:', err, '| Entry:', JSON.stringify(fullEntry));
  }
}
