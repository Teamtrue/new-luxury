/**
 * lib/providers/payment/razorpay.ts
 *
 * Razorpay payment provider implementation.
 *
 * Required keys in provider_config.config_encrypted:
 *   key_id         — Razorpay API key ID (e.g. rzp_live_xxx or rzp_test_xxx)
 *   key_secret     — Razorpay API key secret
 *
 * Optional key:
 *   (webhook_secret_encrypted column on provider_config row)
 *
 * References:
 *   https://razorpay.com/docs/api/orders/
 *   https://razorpay.com/docs/api/payments/
 *   https://razorpay.com/docs/webhooks/validate-test/
 *
 * TODO: AI — After order creation, wire the orderId through a fraud-scoring
 *       service (e.g. Sift or internal ML model) before presenting the
 *       checkout to the user.  Flag high-risk orders for manual review before
 *       capture.
 */

import Razorpay from 'razorpay'
import crypto from 'crypto'
import type {
  PaymentProvider,
  ProviderConfig,
  CreateOrderParams,
  OrderResult,
  VerifySignatureParams,
  RefundParams,
  RefundResult,
  WebhookEvent,
} from '../types'
import { ProviderError } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Timing-safe string equality using Buffer comparison */
function timingSafeEqual(a: string, b: string): boolean {
  // Pad both to equal length to avoid length-oracle attacks
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')

  if (bufA.length !== bufB.length) {
    // Still perform a dummy comparison to spend constant time
    crypto.timingSafeEqual(bufA, bufA)
    return false
  }

  return crypto.timingSafeEqual(bufA, bufB)
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay' as const
  readonly isTestMode: boolean

  private readonly client: Razorpay
  private readonly keySecret: string
  private readonly webhookSecret: string | undefined

  constructor(config: ProviderConfig) {
    const keyId = config.config['key_id']
    const keySecret = config.config['key_secret']

    if (!keyId || !keySecret) {
      throw new ProviderError(
        'razorpay',
        null,
        'Razorpay config is missing key_id or key_secret. Update credentials in Admin → Providers.'
      )
    }

    this.isTestMode = config.isTestMode
    this.keySecret = keySecret
    this.webhookSecret = config.webhookSecret

    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret })
  }

  // -------------------------------------------------------------------------
  // createOrder
  // -------------------------------------------------------------------------

  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    const { amountPaise, currency, receiptId, notes } = params

    // Razorpay receipt max length is 40 characters
    const receipt = receiptId.slice(0, 40)

    let rawOrder: Record<string, unknown>

    try {
      const orderResult = await this.client.orders.create({
        amount: amountPaise,
        currency,
        receipt,
        notes: notes as Record<string, string> | undefined,
      })
      rawOrder = orderResult as unknown as Record<string, unknown>
    } catch (err) {
      throw new ProviderError(
        'razorpay',
        err,
        `Razorpay order creation failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    return {
      orderId: rawOrder['id'] as string,
      amount: rawOrder['amount'] as number,
      currency: rawOrder['currency'] as string,
      providerName: 'razorpay',
      raw: rawOrder,
    }
  }

  // -------------------------------------------------------------------------
  // verifySignature
  // -------------------------------------------------------------------------

  verifySignature(params: VerifySignatureParams): boolean {
    const { orderId, paymentId, signature } = params

    const body = `${orderId}|${paymentId}`
    const expectedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(body)
      .digest('hex')

    return timingSafeEqual(expectedSignature, signature)
  }

  // -------------------------------------------------------------------------
  // processRefund
  // -------------------------------------------------------------------------

  async processRefund(params: RefundParams): Promise<RefundResult> {
    const { providerPaymentId, amountPaise, reason, notes } = params

    let rawRefund: Record<string, unknown>

    try {
      const refundResult = await this.client.payments.refund(providerPaymentId, {
        amount: amountPaise,
        notes: {
          ...(reason ? { reason } : {}),
          ...(notes ?? {}),
        } as Record<string, string>,
      })
      rawRefund = refundResult as unknown as Record<string, unknown>
    } catch (err) {
      throw new ProviderError(
        'razorpay',
        err,
        `Razorpay refund failed for payment ${providerPaymentId}: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    return {
      providerRefundId: rawRefund['id'] as string,
      status: (rawRefund['status'] as string) ?? 'processed',
      amountPaise: rawRefund['amount'] as number,
    }
  }

  // -------------------------------------------------------------------------
  // parseWebhookEvent
  // -------------------------------------------------------------------------

  async parseWebhookEvent(body: string, signature: string): Promise<WebhookEvent> {
    // Verify webhook signature first if a webhook secret is configured
    if (this.webhookSecret) {
      const expectedSig = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(body)
        .digest('hex')

      if (!timingSafeEqual(expectedSig, signature)) {
        throw new ProviderError(
          'razorpay',
          null,
          'Razorpay webhook signature verification failed. Ensure webhook_secret matches your Razorpay dashboard setting.'
        )
      }
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(body) as Record<string, unknown>
    } catch (err) {
      throw new ProviderError('razorpay', err, 'Razorpay webhook body is not valid JSON.')
    }

    const eventType = (payload['event'] as string) ?? 'unknown'

    // Extract nested payment entity safely
    const payloadEntity = payload['payload'] as Record<string, unknown> | undefined
    const paymentEntity = (
      payloadEntity?.['payment'] as Record<string, unknown> | undefined
    )?.['entity'] as Record<string, unknown> | undefined

    const refundEntity = (
      payloadEntity?.['refund'] as Record<string, unknown> | undefined
    )?.['entity'] as Record<string, unknown> | undefined

    const orderEntity = (
      payloadEntity?.['order'] as Record<string, unknown> | undefined
    )?.['entity'] as Record<string, unknown> | undefined

    return {
      type: eventType,
      paymentId:
        (paymentEntity?.['id'] as string | undefined) ??
        (refundEntity?.['payment_id'] as string | undefined),
      orderId:
        (paymentEntity?.['order_id'] as string | undefined) ??
        (orderEntity?.['id'] as string | undefined),
      refundId: refundEntity?.['id'] as string | undefined,
      amountPaise:
        (paymentEntity?.['amount'] as number | undefined) ??
        (refundEntity?.['amount'] as number | undefined) ??
        (orderEntity?.['amount_paid'] as number | undefined),
      raw: payload,
    }
  }
}
