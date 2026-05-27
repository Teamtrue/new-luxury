/**
 * lib/providers/index.ts
 *
 * Public entry point for the PlutusClub provider adapter system.
 *
 * Import from this file — not from the sub-modules — to stay insulated from
 * internal restructuring.
 *
 * Usage:
 *   import { getPaymentProvider, getSMSProvider, getEmailProvider } from '@/lib/providers'
 *   import type { PaymentProvider, OrderResult } from '@/lib/providers'
 */

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export { getPaymentProvider } from './payment'
export { getSMSProvider } from './sms'
export { getEmailProvider } from './email'

// ---------------------------------------------------------------------------
// Cache management — call after admin changes provider settings
// ---------------------------------------------------------------------------

export { invalidateProviderCache } from './config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  // Core
  ProviderType,
  ProviderConfig,
  PaymentProviderName,
  SMSProviderName,
  EmailProviderName,

  // Payment
  PaymentProvider,
  CreateOrderParams,
  OrderResult,
  VerifySignatureParams,
  RefundParams,
  RefundResult,
  WebhookEvent,

  // SMS
  SMSProvider,
  SendOTPParams,
  SendSMSParams,
  SMSResult,

  // Email
  EmailProvider,
  SendEmailParams,
  EmailResult,
  EmailAttachment,
} from './types'

// ---------------------------------------------------------------------------
// Error classes (re-exported as values so consumers can instanceof-check)
// ---------------------------------------------------------------------------

export { ProviderNotConfiguredError, ProviderError } from './types'
