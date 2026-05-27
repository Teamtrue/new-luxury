/**
 * lib/security/headers.ts
 * ---------------------------------------------------------------------------
 * Security response headers for PlutusClub.
 * ---------------------------------------------------------------------------
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://*.supabase.co';

function buildCSP(): string {
  const directives: Record<string, string> = {
    'default-src':  "'self'",
    'script-src':   "'self' 'unsafe-inline' https://checkout.razorpay.com https://api.razorpay.com",
    'style-src':    "'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src':     "'self' https://fonts.gstatic.com",
    'img-src':      "'self' data: https:",
    'connect-src':  `'self' ${SUPABASE_URL} https://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com`,
    'frame-src':    'https://api.razorpay.com https://checkout.razorpay.com',
    'object-src':   "'none'",
    'base-uri':     "'self'",
    'form-action':  "'self'",
  };

  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join('; ');
}

export function getSecurityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': buildCSP(),
  };

  if (IS_PRODUCTION) {
    headers['Strict-Transport-Security'] =
      'max-age=31536000; includeSubDomains; preload';
  }

  return headers;
}

export function applySecurityHeaders(response: Response): Response {
  const secHeaders = getSecurityHeaders();
  const newHeaders = new Headers(response.headers);

  for (const [name, value] of Object.entries(secHeaders)) {
    newHeaders.set(name, value);
  }

  return new Response(response.body, {
    status:     response.status,
    statusText: response.statusText,
    headers:    newHeaders,
  });
}

export function applySecurityHeadersMutable(
  response: { headers: { set(name: string, value: string): void } }
): void {
  const secHeaders = getSecurityHeaders();
  for (const [name, value] of Object.entries(secHeaders)) {
    response.headers.set(name, value);
  }
}
