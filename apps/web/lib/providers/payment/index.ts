/**
 * lib/providers/payment/index.ts
 *
 * Payment provider factory.
 *
 * Reads the active payment_gateway provider from the DB (cached in memory for
 * 5 min) and returns the correct PaymentProvider implementation.
 *
 * Usage:
 *   const payment = await getPaymentProvider()
 *   const order   = await payment.createOrder({ ... })
 */

import { loadProviderConfig } from '../config'
import { ProviderNotConfiguredError, ProviderError } from '../types'
import type { PaymentProvider } from '../types'
import { RazorpayProvider } from './razorpay'
import { StripeProvider } from './stripe'
import { PayUProvider } from './payu'

export type { PaymentProvider }

/**
 * Returns an instantiated PaymentProvider for the currently active gateway.
 *
 * @throws {ProviderNotConfiguredError} if no active payment_gateway is set
 * @throws {ProviderError}              if the provider name is unrecognised
 */
export async function getPaymentProvider(): Promise<PaymentProvider> {
  const config = await loadProviderConfig('payment_gateway')

  if (!config) {
    throw new ProviderNotConfiguredError('payment_gateway')
  }

  switch (config.providerName) {
    case 'razorpay':
      return new RazorpayProvider(config)
    case 'stripe':
      return new StripeProvider(config)
    case 'payu':
      return new PayUProvider(config)
    default:
      throw new ProviderError(
        config.providerName,
        null,
        `Unknown payment provider: "${config.providerName}". Add a case in lib/providers/payment/index.ts.`
      )
  }
}
