/**
 * lib/providers/email/smtp.ts
 *
 * SMTP email provider implementation using Nodemailer.
 *
 * NOTE: `nodemailer` is NOT in the current package.json.
 *       Run: pnpm add nodemailer && pnpm add -D @types/nodemailer
 *       before deploying this provider.
 *
 * Required keys in provider_config.config_encrypted:
 *   host        — SMTP hostname (e.g. smtp.gmail.com, mail.example.com)
 *   port        — SMTP port as string (e.g. "587", "465", "25")
 *   secure      — "true" for TLS on connect (port 465), "false" for STARTTLS
 *   user        — SMTP login username
 *   pass        — SMTP login password / app password
 *   from_email  — Default from address (e.g. noreply@plutusclub.in)
 *   from_name   — Display name (e.g. PlutusClub)
 *
 * TODO: AI — Track per-recipient bounce and open rates (via SMTP feedback
 *       loops or a tracking pixel service).  Feed bounce signals into the
 *       member health score so churned/invalid emails don't generate future
 *       notification queue entries.
 */

// NOTE: nodemailer is not yet installed. Add it with:
//   pnpm add nodemailer && pnpm add -D @types/nodemailer
// Until then, we use a dynamic require wrapped in unknown to satisfy the
// TypeScript compiler.  This will throw at RUNTIME if nodemailer is absent,
// which is intentional — the missing-package error is clear and actionable.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NodemailerModule = any

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer: NodemailerModule = require('nodemailer')

import type {
  EmailProvider,
  ProviderConfig,
  SendEmailParams,
  EmailResult,
} from '../types'
import { ProviderError } from '../types'

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class SMTPProvider implements EmailProvider {
  readonly name = 'smtp' as const

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly transporter: any
  private readonly defaultFrom: string

  constructor(config: ProviderConfig) {
    const { host, port, secure, user, pass, from_email, from_name } = config.config

    if (!host) throw new ProviderError('smtp', null, 'SMTP config missing host.')
    if (!port) throw new ProviderError('smtp', null, 'SMTP config missing port.')
    if (!user) throw new ProviderError('smtp', null, 'SMTP config missing user.')
    if (!pass) throw new ProviderError('smtp', null, 'SMTP config missing pass.')
    if (!from_email) throw new ProviderError('smtp', null, 'SMTP config missing from_email.')

    const isSecure = secure === 'true' || secure === '1'
    const portNum = parseInt(port, 10)

    this.defaultFrom = from_name ? `"${from_name}" <${from_email}>` : from_email

    this.transporter = nodemailer.createTransport({
      host,
      port: portNum,
      secure: isSecure,
      auth: { user, pass },
    })

    // Verify connection on construction — log a warning on failure but don't throw.
    // A broken SMTP config will surface as an error on the first sendEmail() call.
    this.transporter.verify().catch((err: unknown) => {
      console.error(
        '[providers/email/smtp] SMTP connection verification failed:',
        err instanceof Error ? err.message : err
      )
    })
  }

  // -------------------------------------------------------------------------
  // sendEmail
  // -------------------------------------------------------------------------

  async sendEmail(params: SendEmailParams): Promise<EmailResult> {
    const { to, subject, html, text, from, replyTo, attachments } = params

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mailOptions: any = {
      from: from ?? this.defaultFrom,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
      ...(attachments
        ? {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              contentType: a.contentType,
            })),
          }
        : {}),
    }

    let info: { messageId: string }
    try {
      info = await this.transporter.sendMail(mailOptions)
    } catch (err) {
      throw new ProviderError(
        'smtp',
        err,
        `SMTP sendMail failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    return {
      messageId: info.messageId,
      status: 'sent',
    }
  }
}
