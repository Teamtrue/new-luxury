/**
 * lib/providers/payment/stripe.ts
 *
 * Stripe payment provider — STUB implementation.
 *
 * This stub throws a descriptive ProviderError on every method call.
 * To implement:
 *   1. Run: pnpm add stripe
 *   2. Add required env vars / admin panel config keys:
 *        secret_key      — Stripe secret key (sk_live_xxx or sk_test_xxx)
 *        publishable_key — Stripe publishable key (pk_live_xxx / pk_test_xxx)
 *        webhook_secret  — Stripe webhook signing secret (whsec_xxx)
 *   3. Replace stub methods with real Stripe SDK calls.
 *      See: https://stripe.com/docs/api
 *
 * TODO: AI — Stripe supports intelligent payment retry logic and adaptive
 *       acceptance tools. Wire the createOrder flow through Stripe Radar
 *       rules and feed the fraud score back into our internal risk model
 *       before presenting the checkout to the user.
 */

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

const NOT_IMPLEMENTED_MSG =
  'Stripe is not yet implemented. Configure Stripe credentials in Admin → Settings → Providers and complete the Stripe provider implementation.'

export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe' as const
  readonly isTestMode: boolean

  constructor(config: ProviderConfig) {
    this.isTestMode = config.isTestMode
  }

  createOrder(_params: CreateOrderParams): Promise<OrderResult> {
    throw new ProviderError('stripe', null, NOT_IMPLEMENTED_MSG)
  }

  verifySignature(_params: VerifySignatureParams): boolean {
    throw new ProviderError('stripe', null, NOT_IMPLEMENTED_MSG)
  }

  processRefund(_params: RefundParams): Promise<RefundResult> {
    throw new ProviderError('stripe', null, NOT_IMPLEMENTED_MSG)
  }

  parseWebhookEvent(_body: string, _signature: string): Promise<WebhookEvent> {
    throw new ProviderError('stripe', null, NOT_IMPLEMENTED_MSG)
  }
}
