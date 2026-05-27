/**
 * lib/providers/email/aws-ses.ts
 *
 * AWS SES email provider — STUB implementation.
 *
 * This stub throws a descriptive ProviderError on every method call.
 * To implement:
 *   1. Run: pnpm add @aws-sdk/client-sesv2
 *   2. Add required env vars / admin panel config keys:
 *        aws_access_key_id      — IAM access key with ses:SendEmail permission
 *        aws_secret_access_key  — IAM secret key
 *        aws_region             — AWS region (e.g. ap-south-1)
 *        from_email             — Verified SES sender address
 *        from_name              — Display name (e.g. PlutusClub)
 *   3. Replace stub methods with real SESv2Client calls.
 *      See: https://docs.aws.amazon.com/ses/latest/dg/send-email-api.html
 *
 * NOTE: Your SES sending identity (domain or email) must be verified and
 *       the account must be out of the SES sandbox before production use.
 *
 * TODO: AI — SES Reputation Dashboard exposes bounce and complaint metrics.
 *       Feed these into a member reachability score; suppress notifications
 *       for members whose email consistently bounces to protect sender
 *       reputation and reduce AWS SES costs.
 */

import type {
  EmailProvider,
  ProviderConfig,
  SendEmailParams,
  EmailResult,
} from '../types'
import { ProviderError } from '../types'

const NOT_IMPLEMENTED_MSG =
  'AWS SES is not yet implemented. Configure AWS credentials in Admin → Settings → Providers and complete the SES provider implementation.'

export class AWSSESProvider implements EmailProvider {
  readonly name = 'aws_ses' as const

  constructor(_config: ProviderConfig) {
    // Config accepted but not used until implementation is complete
  }

  sendEmail(_params: SendEmailParams): Promise<EmailResult> {
    throw new ProviderError('aws_ses', null, NOT_IMPLEMENTED_MSG)
  }
}
