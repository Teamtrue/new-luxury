/**
 * middleware.ts
 * ---------------------------------------------------------------------------
 * Next.js Edge Middleware for PlutusClub.
 * ---------------------------------------------------------------------------
 */

import { NextResponse, type NextRequest } from 'next/server';
import { applySecurityHeadersMutable }    from './lib/security/headers';
import { getClientIP, assertRateLimit }   from './lib/security/rate-limit';

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.svg$|.*\\.webp$|.*\\.ico$).*)',
  ],
};

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')) return true;
    if (cookie.name === 'sb-access-token' || cookie.name === 'sb-auth-token') return true;
  }
  return false;
}

export async function middleware(request: NextRequest): Promise<NextResponse | Response> {
  const { pathname } = request.nextUrl;

  const response = NextResponse.next();
  applySecurityHeadersMutable(response);

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const adminCookie = request.cookies.get('__admin_session');

    if (!adminCookie?.value) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      const redirect = NextResponse.redirect(loginUrl);
      applySecurityHeadersMutable(redirect);
      return redirect;
    }
  }

  if (pathname.startsWith('/member')) {
    const hasSession = hasSupabaseAuthCookie(request);

    if (!hasSession) {
      const signinUrl = new URL('/signin', request.url);
      signinUrl.searchParams.set('next', pathname);
      const redirect = NextResponse.redirect(signinUrl);
      applySecurityHeadersMutable(redirect);
      return redirect;
    }
  }

  if (pathname.startsWith('/api/auth/') || pathname.startsWith('/api/payments/')) {
    const ip = getClientIP(request);
    const limitKey = pathname.startsWith('/api/auth/')
      ? ('auth:login' as const)
      : ('api:general' as const);

    const rateLimitResponse = await assertRateLimit(limitKey, ip);
    if (rateLimitResponse) {
      applySecurityHeadersMutable(rateLimitResponse as unknown as { headers: { set(n: string, v: string): void } });
      return rateLimitResponse;
    }
  }

  return response;
}
