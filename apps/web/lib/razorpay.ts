import crypto from 'crypto';
import { requireEnv } from './env';
import { timingSafeEqual } from './security/tokens';

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const body = orderId + '|' + paymentId;
  const expectedSignature = crypto
    .createHmac('sha256', requireEnv('RAZORPAY_KEY_SECRET'))
    .update(body)
    .digest('hex');
  return timingSafeEqual(expectedSignature, signature);
}
