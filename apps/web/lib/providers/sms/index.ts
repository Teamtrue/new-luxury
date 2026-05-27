/**
 * lib/providers/sms/index.ts
 *
 * SMS provider factory.
 *
 * Reads the active sms provider from the DB (cached in memory for 5 min)
 * and returns the correct SMSProvider implementation.
 *
 * Usage:
 *   const sms = await getSMSProvider()
 *   await sms.sendOTP({ phone: '+919876543210', otp: '123456', expiryMinutes: 10 })
 */

import { loadProviderConfig } from '../config'
import { ProviderNotConfiguredError, ProviderError } from '../types'
import type { SMSProvider } from '../types'
import { MSG91Provider } from './msg91'
import { TwilioProvider } from './twilio'
import { AWSSNSProvider } from './aws-sns'

export type { SMSProvider }

/**
 * Returns an instantiated SMSProvider for the currently active SMS service.
 *
 * @throws {ProviderNotConfiguredError} if no active sms provider is set
 * @throws {ProviderError}              if the provider name is unrecognised
 */
export async function getSMSProvider(): Promise<SMSProvider> {
  const config = await loadProviderConfig('sms')

  if (!config) {
    throw new ProviderNotConfiguredError('sms')
  }

  switch (config.providerName) {
    case 'msg91':
      return new MSG91Provider(config)
    case 'twilio':
      return new TwilioProvider(config)
    case 'aws_sns':
      return new AWSSNSProvider(config)
    default:
      throw new ProviderError(
        config.providerName,
        null,
        `Unknown SMS provider: "${config.providerName}". Add a case in lib/providers/sms/index.ts.`
      )
  }
}
