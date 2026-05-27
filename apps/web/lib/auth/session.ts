/**
 * lib/auth/session.ts
 * ---------------------------------------------------------------------------
 * Member sessions use Supabase Auth. Admin sessions use hashed custom tokens
 * stored in Postgres and carried by an HttpOnly cookie.
 * ---------------------------------------------------------------------------
 */

import { generateSecureToken, hashToken } from '../security/tokens';
import { createClient }             from '../supabase/server';
import { createServiceRoleClient }  from '../supabase/service';

export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
  role: 'member';
}

export type AdminRole = 'super_admin' | 'admin' | 'support' | 'finance' | 'partner_manager';

export interface AdminSession {
  id: string;
  adminUserId: string;
  role: AdminRole;
  ip: string;
  expiresAt: Date;
}

export const ADMIN_SESSION_COOKIE = '__admin_session';

const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export async function getAuthUser(request?: Request): Promise<AuthUser | null> {
  try {
    const supabase = await createClient();
    const authHeader = request?.headers.get('Authorization') ?? '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;

    const { data: { user }, error } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (error || !user) return null;

    return {
      id:    user.id,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      role:  'member',
    };
  } catch {
    return null;
  }
}

export async function getAdminSession(request: Request): Promise<AdminSession | null> {
  let rawToken: string | null = null;

  const authHeader = request.headers.get('Authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.slice('Bearer '.length).trim();
  }

  if (!rawToken) {
    const cookieHeader = request.headers.get('cookie') ?? '';
    const cookies = parseCookieHeader(cookieHeader);
    rawToken = cookies[ADMIN_SESSION_COOKIE] ?? null;
  }

  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);

  try {
    const db = createServiceRoleClient();

    const { data, error } = await db
      .from('admin_sessions')
      .select(`
        id,
        admin_user_id,
        expires_at,
        ip_address,
        admin_users ( role )
      `)
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return null;

    const adminUsersRaw = data.admin_users as unknown;
    const adminUsers = (
      Array.isArray(adminUsersRaw) ? adminUsersRaw[0] : adminUsersRaw
    ) as { role: AdminRole } | null;
    if (!adminUsers) return null;

    return {
      id:           data.id as string,
      adminUserId:  data.admin_user_id as string,
      role:         adminUsers.role,
      ip:           (data.ip_address as string) ?? '',
      expiresAt:    new Date(data.expires_at as string),
    };
  } catch {
    return null;
  }
}

export async function createAdminSession(
  adminUserId: string,
  ip: string,
  userAgent: string
): Promise<string> {
  const rawToken  = generateSecureToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString();

  const db = createServiceRoleClient();
  const { error } = await db.from('admin_sessions').insert({
    admin_user_id: adminUserId,
    token_hash:    tokenHash,
    expires_at:    expiresAt,
    ip_address:    ip,
    user_agent:    userAgent,
  });

  if (error) {
    throw new Error(`Failed to create admin session: ${error.message}`);
  }

  return rawToken;
}

export async function invalidateAdminSession(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const db = createServiceRoleClient();
  await db.from('admin_sessions').delete().eq('token_hash', tokenHash);
}

function parseCookieHeader(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(';').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [
        decodeURIComponent(key?.trim() ?? ''),
        decodeURIComponent(rest.join('=')),
      ];
    })
  );
}
