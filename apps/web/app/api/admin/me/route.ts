/**
 * app/api/admin/me/route.ts
 * ---------------------------------------------------------------------------
 * Returns the current admin session info and resolved permissions.
 * ---------------------------------------------------------------------------
 */

import { apiSuccess, requireAdmin } from '@/lib/api-helpers';
import { ROLE_PERMISSIONS }         from '@/lib/auth/rbac';
import { createServiceRoleClient }  from '@/lib/supabase/service';
import type { AdminRole }           from '@/lib/auth/rbac';

// ---------------------------------------------------------------------------
// GET /api/admin/me
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  const { session } = auth;

  // Fetch display name from admin_users → auth.users if available.
  let name: string | null = null;
  try {
    const db = createServiceRoleClient();
    const { data } = await db
      .from('admin_users')
      .select('user_id')
      .eq('id', session.adminUserId)
      .single();

    if (data?.user_id) {
      // Use the Supabase admin API to fetch the user's display name.
      const { data: userData } = await db.auth.admin.getUserById(data.user_id);
      name =
        userData?.user?.user_metadata?.full_name ??
        userData?.user?.email ??
        null;
    }
  } catch {
    // Non-critical — continue without name.
  }

  const permissions = ROLE_PERMISSIONS[session.role as AdminRole] ?? [];

  return apiSuccess({
    id:          session.adminUserId,
    sessionId:   session.id,
    role:        session.role,
    name,
    expiresAt:   session.expiresAt.toISOString(),
    permissions,
  });
}
