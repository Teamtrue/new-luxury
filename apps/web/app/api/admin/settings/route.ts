/**
 * app/api/admin/settings/route.ts
 * ---------------------------------------------------------------------------
 * GET   /api/admin/settings — return all platform_settings key/value pairs
 * PATCH /api/admin/settings — upsert a platform setting (super_admin only)
 * ---------------------------------------------------------------------------
 */

import { z }                           from 'zod';
import { apiSuccess, apiError, requireAdmin, buildAuditEntry } from '@/lib/api-helpers';
import { assertCsrf }                  from '@/lib/security/csrf';
import { createServiceRoleClient }     from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// GET /api/admin/settings
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, 'providers:read');
  if ('error' in auth) return auth.error;

  try {
    const db = createServiceRoleClient();

    const { data, error } = await db
      .from('platform_settings')
      .select('key, value, description, updated_at')
      .order('key');

    if (error) {
      console.error('[admin/settings] GET query error:', error.message);
      return apiError('Failed to fetch platform settings.', 500);
    }

    return apiSuccess({ settings: data ?? [] });
  } catch (err) {
    console.error('[admin/settings] GET unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/settings — super_admin only
// ---------------------------------------------------------------------------

const patchSettingSchema = z.object({
  key:         z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, 'Key must be lowercase snake_case.'),
  value:       z.string().max(1000),
  description: z.string().max(500).optional(),
});

export async function PATCH(request: Request): Promise<Response> {
  // super_admin only — requireAdmin with no specific permission, then check role
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  if (session.role !== 'super_admin') {
    return apiError('Only super_admin can modify platform settings.', 403);
  }

  // CSRF check
  const csrfError = assertCsrf(request, session.id);
  if (csrfError) return csrfError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid JSON in request body.', 400);
  }

  const parsed = patchSettingSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return apiError(first?.message ?? 'Validation failed.', 400, parsed.error.issues);
  }

  const { key, value, description } = parsed.data;

  try {
    const db = createServiceRoleClient();

    // Call the set_platform_setting DB function (handles upsert + audit trail in DB)
    const { error: rpcError } = await db.rpc('set_platform_setting', {
      p_key:      key,
      p_value:    value,
      p_admin_id: session.adminUserId,
    });

    if (rpcError) {
      console.error('[admin/settings] set_platform_setting RPC error:', rpcError.message);
      return apiError('Failed to update setting.', 500);
    }

    // Optionally update description if provided
    if (description) {
      await db
        .from('platform_settings')
        .update({ description })
        .eq('key', key);
    }

    await db.from('audit_logs').insert(
      buildAuditEntry({
        action:     'settings.updated',
        actorType:  'admin',
        actorId:    session.adminUserId,
        targetType: 'platform_settings',
        details:    { key, value },
        request,
      })
    );

    return apiSuccess({ key, value, message: 'Setting updated successfully.' });
  } catch (err) {
    console.error('[admin/settings] PATCH unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
