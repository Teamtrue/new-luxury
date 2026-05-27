import { describe, expect, it } from 'vitest';
import { createHmac, generateOTP, generateSecureToken, hashToken, timingSafeEqual } from '../../lib/security/tokens';

describe('security token utilities', () => {
  it('generates hex tokens with the requested entropy size', () => {
    const token = generateSecureToken(16);

    expect(token).toMatch(/^[a-f0-9]{32}$/);
  });

  it('hashes tokens deterministically without returning the raw token', () => {
    const hash = hashToken('session-token');

    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashToken('session-token'));
    expect(hash).not.toContain('session-token');
  });

  it('compares equal and different length values safely', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });

  it('creates HMAC signatures and fixed-width numeric OTP values', () => {
    expect(createHmac('secret', 'payload')).toHaveLength(64);
    expect(generateOTP()).toMatch(/^\d{6}$/);
  });

  it('rejects unsafe OTP sizes', () => {
    expect(() => generateOTP(3)).toThrow(RangeError);
    expect(() => generateOTP(16)).toThrow(RangeError);
  });
});
