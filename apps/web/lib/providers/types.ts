/**
 * lib/providers/types.ts
 *
 * Shared TypeScript interfaces and types for all pluggable provider adapters:
 * payment gateways, SMS services, and email services.
 *
 * Provider names must match the values stored in provider_config.provider_name
 * in the DB. Provider types must match the provider_type DB enum.
 */

// ---------------------------------------------------------------------------
// Discriminated union literals – must match DB enum values exactly
// ---------------------------------------------------------------------------

/** Matches the provider_type PostgreSQL enum in provider_config */
export type ProviderType = 'payment_gateway' | 'sms' | 'email'

/** Valid payment gateway provider_name values */
export type PaymentProviderName = 'razorpay' | 'stripe' | 'payu'

/** Valid SMS provider_name values */
export type SMSProviderName = 'msg91' | 'twilio' | 'aws_sns'

/** Valid email provider_name values */
export type EmailProviderName = 'smtp' | 'sendgrid' | 'aws_ses'

// ---------------------------------------------------------------------------
// Provider config shape (loaded from DB, credentials already "decrypted")
// ---------------------------------------------------------------------------

/**
 * Normalised provider configuration after loading from provider_config table.
 * In V1 the config field is the raw JSONB; in V2 it will be decrypted with
 * AES-256-GCM using the PROVIDER_ENCRYPTION_KEY env var.
 * TODO: V2 — encrypt/decrypt config_encrypted with AES-256-GCM before storage
 */
export interface ProviderConfig {
  /** provider_config.id (UUID) */
  id: string
  providerType: ProviderType
  providerName: string
  isActive: boolean
  isTestMode: boolean
  /** Decrypted key-value credential pairs, e.g. { key_id, key_secret } */
  config: Record<string, string>
  /** Optional HMAC secret for verifying inbound webhook signatures */
  webhookSecret?: string
}

// ---------------------------------------------------------------------------
// Payment provider interfaces
// ---------------------------------------------------------------------------

export interface CreateOrderParams {
  /** Amount in paise (1 INR = 100 paise) */
  amountPaise: number
  /** ISO currency code, e.g. "INR" */
  currency: string
  /** Human-readable receipt ID, e.g. booking_ref "BK-A3F9XZ" */
  receiptId: string
  /** Optional metadata attached to the order */
  notes?: Record<string, string>
}

export interface OrderResult {
  /** Provider-assigned order ID – store this in payments.provider_order_id */
  orderId: string
  /** Amount in paise (echoed from provider) */
  amount: number
  currency: string
  providerName: PaymentProviderName
  /** Full raw response from provider for audit/debugging */
  raw: Record<string, unknown>
}

export interface VerifySignatureParams {
  orderId: string
  paymentId: string
  /** HMAC signature received from the client / provider callback */
  signature: string
}

export interface RefundParams {
  /** Provider-issued payment transaction ID */
  providerPaymentId: string
  /** Amount to refund in paise (may be partial) */
  amountPaise: number
  reason?: string
  notes?: Record<string, string>
}

export interface RefundResult {
  providerRefundId: string
  /** Status string from the provider (e.g. "processed", "pending") */
  status: string
  amountPaise: number
}

export interface WebhookEvent {
  type:
    | 'payment.captured'
    | 'payment.failed'
    | 'refund.processed'
    | 'order.paid'
    | string
  paymentId?: string
  orderId?: string
  refundId?: string
  /** Amount in paise if present */
  amountPaise?: number
  raw: Record<string, unknown>
}

export interface PaymentProvider {
  name: PaymentProviderName
  isTestMode: boolean
  createOrder(params: CreateOrderParams): Promise<OrderResult>
  /**
   * Synchronous, timing-safe HMAC signature verification.
   * Must use crypto.timingSafeEqual to prevent timing attacks.
   */
  verifySignature(params: VerifySignatureParams): boolean
  processRefund(params: RefundParams): Promise<RefundResult>
  /**
   * Parses and verifies an inbound webhook payload.
   * @param body  Raw request body string (before JSON.parse)
   * @param signature  Value of X-Razorpay-Signature (or equivalent) header
   */
  parseWebhookEvent(body: string, signature: string): Promise<WebhookEvent>
}

// ---------------------------------------------------------------------------
// SMS provider interfaces
// ---------------------------------------------------------------------------

export interface SendOTPParams {
  /** E.164 format, e.g. +919876543210 */
  phone: string
  otp: string
  expiryMinutes: number
}

export interface SendSMSParams {
  /** E.164 format, e.g. +919876543210 */
  phone: string
  message: string
  /**
   * DLT-registered template ID (mandatory for transactional SMS in India).
   * See TRAI regulations – leave undefined only for sandbox/test mode.
   */
  templateId?: string
}

export interface SMSResult {
  messageId: string
  status: 'sent' | 'queued' | 'failed'
}

export interface SMSProvider {
  name: SMSProviderName
  sendOTP(params: SendOTPParams): Promise<SMSResult>
  sendTransactional(params: SendSMSParams): Promise<SMSResult>
}

// ---------------------------------------------------------------------------
// Email provider interfaces
// ---------------------------------------------------------------------------

export interface EmailAttachment {
  filename: string
  content: Buffer | string
  contentType: string
}

export interface SendEmailParams {
  to: string | string[]
  subject: string
  /** Full HTML body */
  html: string
  /** Plain-text fallback body */
  text?: string
  /** Defaults to the provider's configured from address */
  from?: string
  replyTo?: string
  attachments?: EmailAttachment[]
}

export interface EmailResult {
  messageId: string
  status: 'sent' | 'queued' | 'failed'
}

export interface EmailProvider {
  name: EmailProviderName
  sendEmail(params: SendEmailParams): Promise<EmailResult>
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown when a required provider type has no active configuration in the DB.
 * The admin must set one via Admin → Settings → Providers.
 */
export class ProviderNotConfiguredError extends Error {
  constructor(type: ProviderType) {
    super(
      `No active ${type} provider configured. Set one in Admin → Settings → Providers.`
    )
    this.name = 'ProviderNotConfiguredError'
  }
}

/**
 * Wraps a provider-specific error with context about which provider failed
 * and the original error for logging / tracing.
 */
export class ProviderError extends Error {
  constructor(
    public readonly providerName: string,
    public readonly originalError: unknown,
    message: string
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}
