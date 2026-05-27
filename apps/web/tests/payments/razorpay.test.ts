import crypto from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyRazorpaySignature } from '../../lib/razorpay';

const originalSecret = process.env.RAZORPAY_KEY_SECRET;

afterEach(() => {
  process.env.RAZORPAY_KEY_SECRET = originalSecret;
});

function sign(orderId: string, paymentId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

describe('verifyRazorpaySignature', () => {
  it('accepts a valid Razorpay signature', () => {
    process.env.RAZORPAY_KEY_SECRET = 'test_secret';

    expect(
      verifyRazorpaySignature('order_123', 'pay_123', sign('order_123', 'pay_123', 'test_secret'))
    ).toBe(true);
  });

  it('rejects tampered payment values and malformed signatures', () => {
    process.env.RAZORPAY_KEY_SECRET = 'test_secret';
    const signature = sign('order_123', 'pay_123', 'test_secret');

    expect(verifyRazorpaySignature('order_123', 'pay_tampered', signature)).toBe(false);
    expect(verifyRazorpaySignature('order_123', 'pay_123', 'short')).toBe(false);
  });

  it('fails closed when the signing secret is missing', () => {
    delete process.env.RAZORPAY_KEY_SECRET;

    expect(() => verifyRazorpaySignature('order_123', 'pay_123', 'signature')).toThrow(
      'Missing required environment variable: RAZORPAY_KEY_SECRET'
    );
  });
});
