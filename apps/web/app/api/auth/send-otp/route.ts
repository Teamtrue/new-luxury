/**
 * POST /api/auth/send-otp
 * ---------------------------------------------------------------------------
 * Generates and dispatches an OTP to the supplied phone number.
 *
 * Security layers:
 *   1. API-layer rate limit  — 3 requests / minute per phone (Redis or memory)
 *   2. DB-layer rate limit   — 5 OTPs / hour per phone (isPhoneOTPRateLimited)
 *   3. OTP invalidation      — any existing active OTP is burned before a new
 *                             one is created (prevents parallel valid tokens)
 *   4. Hash-only storage     — raw OTP never written to the database
 *
 * The raw OTP is NEVER returned in the API response — not even in dev mode.
 * In dev mode without an SMS provider, the OTP is logged to the server console.
 * ---------------------------------------------------------------------------
 */

import { parseBody, apiSuccess, apiError } from '@/lib/api-helpers';
import { assertRateLimit, getClientIP }    from '@/lib/security/rate-limit';
import { createOTP, isPhoneOTPRateLimited } from '@/lib/auth/otp';
import { getSMSProvider }                   from '@/lib/providers';
import { ProviderNotConfiguredError }        from '@/lib/providers';
import { sendOtpSchema }                     from '@/lib/validations';

export async function POST(request: Request): Promise<Response> {
  // 1. Parse + validate body
  const parsed = await parseBody(request, sendOtpSchema);
  if ('error' in parsed) return parsed.error;
  const { phone } = parsed.data;

  // 2. API-layer rate limit (by phone number)
  const rateLimitError = await assertRateLimit('auth:send-otp', phone);
  if (rateLimitError) return rateLimitError;

  // 3. DB-level hourly rate limit (secondary guard)
  const isLimited = await isPhoneOTPRateLimited('+91' + phone);
  if (isLimited) {
    return apiError(
      'Too many OTP requests for this number. Please wait before requesting a new code.',
      429
    );
  }

  // 4. Generate OTP and store hash in DB
  let otp: string;
  try {
    otp = await createOTP('+91' + phone, 'signin');
  } catch (err) {
    console.error('[send-otp] Failed to create OTP:', err);
    return apiError('Failed to generate OTP. Please try again.', 500);
  }

  // 5. Dispatch via configured SMS provider
  try {
    const smsProvider = await getSMSProvider();
    await smsProvider.sendOTP({
      phone: '+91' + phone,
      otp,
      expiryMinutes: 10,
    });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      if (process.env.NODE_ENV !== 'production') {
        // Dev mode: log to console but do NOT return the OTP in the response.
        console.log(`[DEV] OTP for +91${phone}: ${otp} (expires in 10 min)`);
        return apiSuccess({ message: 'OTP sent (dev mode: check server console)', dev_mode: true });
      }
      return apiError(
        'SMS service is not configured. Please contact support.',
        503
      );
    }

    // Provider threw an unexpected error.
    console.error('[send-otp] SMS provider error:', err);
    return apiError('Failed to send OTP. Please try again in a moment.', 500);
  }

  return apiSuccess({ message: 'OTP sent to your mobile number.' });
}
