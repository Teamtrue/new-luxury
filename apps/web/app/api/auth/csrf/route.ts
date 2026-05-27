import { apiError, apiSuccess } from '@/lib/api-helpers';
import { getAdminSession, getAuthUser } from '@/lib/auth/session';
import { CSRF_COOKIE, generateCsrfToken } from '@/lib/security/csrf';

export async function GET(request: Request): Promise<Response> {
  const adminSession = await getAdminSession(request);
  const member = adminSession ? null : await getAuthUser(request);
  const sessionId = adminSession?.id ?? member?.id;

  if (!sessionId) {
    return apiError('Authentication required.', 401);
  }

  const token = generateCsrfToken(sessionId);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  return new Response(JSON.stringify({ success: true, data: { token } }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${CSRF_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Strict; Max-Age=3600${secure}`,
    },
  });
}
