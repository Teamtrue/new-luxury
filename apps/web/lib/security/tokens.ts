/**
 * lib/security/tokens.ts
 * ---------------------------------------------------------------------------
 * Cryptographic token utilities for PlutusClub.
 * All functions use the Node.js built-in `crypto` module — no third-party deps.
 * ---------------------------------------------------------------------------
 */

import crypto from 'crypto';

/**
 * Generate a cryptographically secure random token.
 *
 * @param bytes - Number of random bytes to generate (default 32 → 64-char hex string).
 * @returns Hex-encoded string of `bytes` random bytes.
 */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Create an HMAC-SHA256 signature of `data` using `secret`.
 * Used for CSRF tokens, webhook signature verification, etc.
 *
 * @param secret - The HMAC secret key (must be kept server-side).
 * @param data   - The message string to sign.
 * @returns Hex-encoded HMAC-SHA256 digest.
 */
export function createHmac(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Timing-safe string comparison to prevent timing side-channel attacks.
 * Uses `crypto.timingSafeEqual` on Buffer representations.
 * Handles strings of differing lengths without short-circuiting.
 *
 * @param a - First string.
 * @param b - Second string to compare against.
 * @returns `true` if both strings are identical, `false` otherwise.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    const dummyA = Buffer.alloc(bufB.length);
    bufA.copy(dummyA, 0, 0, Math.min(bufA.length, bufB.length));
    crypto.timingSafeEqual(dummyA, bufB);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Hash a token for safe storage (one-way SHA-256).
 * Use this before writing session tokens to the database so raw tokens
 * are never stored at rest.
 *
 * @param token - The raw token string to hash.
 * @returns Hex-encoded SHA-256 digest of the token.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a numeric One-Time Password (OTP).
 *
 * Uses `crypto.randomInt` which is cryptographically secure and avoids the
 * modulo bias present in `Math.random()` approaches.
 *
 * @param digits - Number of OTP digits (default 6). Max 15 (JS safe integer limit).
 * @returns Zero-padded numeric string of length `digits`.
 */
export function generateOTP(digits = 6): string {
  if (digits < 4 || digits > 15) {
    throw new RangeError(`OTP digits must be between 4 and 15, got ${digits}`);
  }
  const max = Math.pow(10, digits);
  return crypto.randomInt(0, max).toString().padStart(digits, '0');
}
