/**
 * lib/providers/payment/payu.ts
 *
 * PayU payment provider — STUB implementation.
 *
 * This stub throws a descriptive ProviderError on every method call.
 * To implement:
 *   1. No official Node SDK — use fetch against PayU REST API directly.
 *      See: https://devguide.payu.in/
 *   2. Add required env vars / admin panel config keys:
 *        merchant_key    — PayU merchant key
 *        merchant_salt   — PayU merchant salt (for HMAC-SHA512 signature)
 *        auth_header     — Authorization header value for PayU APIs
 *   3. Replace stub methods with real PayU API calls.
 *
 * TODO: AI — PayU's Smart Router automatically selects the optimal acquiring
 *       bank for each transaction. Feed our member tier into the PayU request
 *       metadata so that Obsidian/Platinum members get preferred routing.
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
  'PayU is not yet implemented. Configure PayU credentials in Admin → Settings → Providers and complete the PayU provider implementation.'

export class PayUProvider implements PaymentProvider {
  readonly name = 'payu' as const
  readonly isTestMode: boolean

  constructor(config: ProviderConfig) {
    this.isTestMode = config.isTestMode
  }

  createOrder(_params: CreateOrderParams): Promise<OrderResult> {
    throw new ProviderError('payu', null, NOT_IMPLEMENTED_MSG)
  }

  verifySignature(_params: VerifySignatureParams): boolean {
    throw new ProviderError('payu', null, NOT_IMPLEMENTED_MSG)
  }

  processRefund(_params: RefundParams): Promise<RefundResult> {
    throw new ProviderError('payu', null, NOT_IMPLEMENTED_MSG)
  }

  parseWebhookEvent(_body: string, _signature: string): Promise<WebhookEvent> {
    throw new ProviderError('payu', null, NOT_IMPLEMENTED_MSG)
  }
}
