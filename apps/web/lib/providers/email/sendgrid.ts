/**
 * lib/providers/email/sendgrid.ts
 *
 * SendGrid email provider implementation using the SendGrid Mail Send API v3.
 *
 * No SendGrid SDK is used — plain fetch with Bearer auth to keep the bundle
 * minimal.
 *
 * Required keys in provider_config.config_encrypted:
 *   api_key     — SendGrid API key (SG.xxxxxxxxxx)
 *   from_email  — Verified sender email address (must be verified in SendGrid)
 *   from_name   — Display name for the from address (e.g. PlutusClub)
 *
 * API Reference:
 *   https://docs.sendgrid.com/api-reference/mail-send/mail-send
 *
 * TODO: AI — Enable SendGrid Event Webhooks and parse open/click/bounce
 *       events into the notifications table.  Train a send-time optimisation
 *       model on open-rate data to schedule membership renewal reminders at
 *       each member's personal peak-open window.
 */

import type {
  EmailProvider,
  ProviderConfig,
  SendEmailParams,
  EmailResult,
} from '../types'
import { ProviderError } from '../types'

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'

// ---------------------------------------------------------------------------
// SendGrid payload shape (subset we need)
// ---------------------------------------------------------------------------

interface SendGridPersonalization {
  to: Array<{ email: string }>
}

interface SendGridAttachment {
  content: string   // base64
  filename: string
  type: string
}

interface SendGridPayload {
  personalizations: SendGridPersonalization[]
  from: { email: string; name?: string }
  reply_to?: { email: string }
  subject: string
  content: Array<{ type: string; value: string }>
  attachments?: SendGridAttachment[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toArray(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to]
}

function toBase64(content: Buffer | string): string {
  if (Buffer.isBuffer(content)) return content.toString('base64')
  return Buffer.from(content).toString('base64')
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class SendGridProvider implements EmailProvider {
  readonly name = 'sendgrid' as const

  private readonly apiKey: string
  private readonly fromEmail: string
  private readonly fromName: string | undefined

  constructor(config: ProviderConfig) {
    const { api_key, from_email, from_name } = config.config

    if (!api_key) throw new ProviderError('sendgrid', null, 'SendGrid config missing api_key.')
    if (!from_email) throw new ProviderError('sendgrid', null, 'SendGrid config missing from_email.')

    this.apiKey = api_key
    this.fromEmail = from_email
    this.fromName = from_name || undefined
  }

  // -------------------------------------------------------------------------
  // sendEmail
  // -------------------------------------------------------------------------

  async sendEmail(params: SendEmailParams): Promise<EmailResult> {
    const { to, subject, html, text, from, replyTo, attachments } = params

    // Parse optional override from address
    const fromAddress = from ?? this.fromEmail
    const fromName = this.fromName

    const recipients = toArray(to)

    const payload: SendGridPayload = {
      personalizations: [
        {
          to: recipients.map((email) => ({ email })),
        },
      ],
      from: {
        email: fromAddress,
        ...(fromName ? { name: fromName } : {}),
      },
      subject,
      content: [
        // SendGrid requires at least one content block
        ...(text ? [{ type: 'text/plain', value: text }] : []),
        { type: 'text/html', value: html },
      ],
      ...(replyTo ? { reply_to: { email: replyTo } } : {}),
      ...(attachments && attachments.length > 0
        ? {
            attachments: attachments.map((a) => ({
              content: toBase64(a.content),
              filename: a.filename,
              type: a.contentType,
            })),
          }
        : {}),
    }

    let response: Response
    try {
      response = await fetch(SENDGRID_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      throw new ProviderError(
        'sendgrid',
        err,
        `SendGrid network error: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    if (!response.ok) {
      const body = await response.text()
      let errorDetail = body
      try {
        const parsed = JSON.parse(body) as { errors?: Array<{ message: string }> }
        errorDetail = parsed.errors?.map((e) => e.message).join('; ') ?? body
      } catch {
        // keep raw body
      }
      throw new ProviderError(
        'sendgrid',
        { status: response.status, body },
        `SendGrid API error (HTTP ${response.status}): ${errorDetail}`
      )
    }

    // SendGrid returns 202 Accepted with no body; X-Message-Id is in the header
    const messageId =
      response.headers.get('X-Message-Id') ??
      response.headers.get('x-message-id') ??
      `sg-${Date.now()}`

    return { messageId, status: 'queued' }
  }
}
