/**
 * lib/providers/email/index.ts
 *
 * Email provider factory.
 *
 * Reads the active email provider from the DB (cached in memory for 5 min)
 * and returns the correct EmailProvider implementation.
 *
 * Usage:
 *   const email = await getEmailProvider()
 *   await email.sendEmail({ to: 'user@example.com', subject: '...', html: '...' })
 */

import { loadProviderConfig } from '../config'
import { ProviderNotConfiguredError, ProviderError } from '../types'
import type { EmailProvider } from '../types'
import { SMTPProvider } from './smtp'
import { SendGridProvider } from './sendgrid'
import { AWSSESProvider } from './aws-ses'

export type { EmailProvider }

/**
 * Returns an instantiated EmailProvider for the currently active email service.
 *
 * @throws {ProviderNotConfiguredError} if no active email provider is set
 * @throws {ProviderError}              if the provider name is unrecognised
 */
export async function getEmailProvider(): Promise<EmailProvider> {
  const config = await loadProviderConfig('email')

  if (!config) {
    throw new ProviderNotConfiguredError('email')
  }

  switch (config.providerName) {
    case 'smtp':
      return new SMTPProvider(config)
    case 'sendgrid':
      return new SendGridProvider(config)
    case 'aws_ses':
      return new AWSSESProvider(config)
    default:
      throw new ProviderError(
        config.providerName,
        null,
        `Unknown email provider: "${config.providerName}". Add a case in lib/providers/email/index.ts.`
      )
  }
}
