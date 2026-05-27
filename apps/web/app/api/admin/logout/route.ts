/**
 * app/api/admin/logout/route.ts
 * ---------------------------------------------------------------------------
 * Admin logout: invalidates the admin session and clears the cookie.
 * ---------------------------------------------------------------------------
 */

import { apiSuccess }                 from '@/lib/api-helpers';
import { invalidateAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/auth/session';

// ---------------------------------------------------------------------------
// POST /api/admin/logout
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // Extract raw token from cookie (mirroring session.ts parse logic).
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((part) => {
      const [k, ...rest] = part.trim().split('=');
      return [decodeURIComponent(k?.trim() ?? ''), decodeURIComponent(rest.join('='))];
    })
  );
  const rawToken = cookies[ADMIN_SESSION_COOKIE] ?? null;

  if (rawToken) {
    await invalidateAdminSession(rawToken).catch((err) => {
      // Best-effort — even if invalidation fails, we still clear the cookie.
      console.error('[admin/logout] Failed to invalidate session:', err);
    });
  }

  // Clear the cookie by setting Max-Age=0.
  const clearCookie = [
    `${ADMIN_SESSION_COOKIE}=`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0',
  ].join('; ');

  return new Response(
    JSON.stringify({ success: true, data: { message: 'Logged out successfully.' } }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie':   clearCookie,
      },
    }
  );
}
