/**
 * lib/security/csrf.ts
 * ---------------------------------------------------------------------------
 * CSRF protection using the Double-Submit Cookie pattern.
 * ---------------------------------------------------------------------------
 */

import { createHmac, timingSafeEqual } from './tokens';

const CSRF_SECRET = process.env.CSRF_SECRET ?? '';

export const CSRF_COOKIE = '__Host-csrf';
export const CSRF_HEADER = 'x-csrf-token';

const TOKEN_TTL_MS = 60 * 60 * 1000;

export function generateCsrfToken(sessionId: string): string {
  if (!CSRF_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CSRF_SECRET environment variable is not set. Cannot generate CSRF tokens.');
    }
    console.warn('[CSRF] CSRF_SECRET is not set — CSRF protection is degraded in development.');
  }

  const timestamp = Date.now().toString(36);
  const message = `${sessionId}:${timestamp}`;
  const mac = createHmac(CSRF_SECRET || 'dev-csrf-secret-REPLACE-ME', message).slice(0, 32);
  return `${timestamp}.${mac}`;
}

export function validateCsrfToken(token: string, sessionId: string): boolean {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestampB36, mac] = parts;
  const timestamp = parseInt(timestampB36, 36);
  if (isNaN(timestamp)) return false;

  const age = Date.now() - timestamp;
  if (age < 0 || age > TOKEN_TTL_MS) return false;

  const message = `${sessionId}:${timestampB36}`;
  const secret = CSRF_SECRET || 'dev-csrf-secret-REPLACE-ME';
  const expectedMac = createHmac(secret, message).slice(0, 32);

  return timingSafeEqual(mac, expectedMac);
}

export function getCsrfFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key?.trim() ?? '', val.join('=')];
    })
  );
  return cookies[CSRF_COOKIE] ?? null;
}

export function assertCsrf(request: Request, sessionId: string): Response | null {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (safeMethods.has(request.method.toUpperCase())) return null;

  const authHeader = request.headers.get('Authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) return null;

  const tokenFromHeader = request.headers.get(CSRF_HEADER);
  if (!tokenFromHeader) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing CSRF token.' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  if (!validateCsrfToken(tokenFromHeader, sessionId)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid or expired CSRF token.' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return null;
}
