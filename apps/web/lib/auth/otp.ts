/**
 * lib/auth/otp.ts
 * ---------------------------------------------------------------------------
 * OTP lifecycle management for PlutusClub's phone-based authentication.
 * ---------------------------------------------------------------------------
 */

import { generateOTP, hashToken, timingSafeEqual } from '../security/tokens';
import { createServiceRoleClient } from '../supabase/service';

export type OtpPurpose = 'signin' | 'verify';

const MAX_ATTEMPTS = 3;
const OTP_TTL_MINUTES = 10;
const HOURLY_OTP_LIMIT = 5;

export async function createOTP(phone: string, purpose: OtpPurpose): Promise<string> {
  const db = createServiceRoleClient();
  const now = new Date().toISOString();

  await db
    .from('auth_otp')
    .update({ used_at: now })
    .eq('phone', phone)
    .eq('purpose', purpose)
    .is('used_at', null)
    .gt('expires_at', now);

  const rawOtp  = generateOTP(6);
  const otpHash = hashToken(rawOtp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error } = await db.from('auth_otp').insert({
    phone,
    otp_hash:      otpHash,
    purpose,
    expires_at:    expiresAt,
    attempt_count: 0,
  });

  if (error) {
    throw new Error(`Failed to store OTP: ${error.message}`);
  }

  return rawOtp;
}

export async function verifyOTP(
  phone: string,
  otp: string,
  purpose: OtpPurpose
): Promise<boolean> {
  const db  = createServiceRoleClient();
  const now = new Date().toISOString();

  const { data, error } = await db
    .from('auth_otp')
    .select('id, otp_hash, attempt_count')
    .eq('phone', phone)
    .eq('purpose', purpose)
    .is('used_at', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return false;

  const record = data as { id: string; otp_hash: string; attempt_count: number };
  const newAttemptCount = record.attempt_count + 1;

  if (newAttemptCount > MAX_ATTEMPTS) {
    await db
      .from('auth_otp')
      .update({ attempt_count: newAttemptCount, used_at: now })
      .eq('id', record.id);
    return false;
  }

  await db
    .from('auth_otp')
    .update({ attempt_count: newAttemptCount })
    .eq('id', record.id);

  const submittedHash = hashToken(otp);
  const isMatch       = timingSafeEqual(submittedHash, record.otp_hash);

  if (isMatch) {
    await db
      .from('auth_otp')
      .update({ used_at: now })
      .eq('id', record.id);
    return true;
  }

  return false;
}

export async function isPhoneOTPRateLimited(phone: string): Promise<boolean> {
  const db = createServiceRoleClient();
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await db
    .from('auth_otp')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', windowStart);

  if (error) {
    console.error('[OTP] Rate limit DB check failed:', error.message);
    return false;
  }

  return (count ?? 0) >= HOURLY_OTP_LIMIT;
}
