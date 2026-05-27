/**
 * lib/providers/sms/aws-sns.ts
 *
 * AWS SNS SMS provider — STUB implementation.
 *
 * This stub throws a descriptive ProviderError on every method call.
 * To implement:
 *   1. Run: pnpm add @aws-sdk/client-sns
 *   2. Add required env vars / admin panel config keys:
 *        aws_access_key_id      — IAM access key with sns:Publish permission
 *        aws_secret_access_key  — IAM secret key
 *        aws_region             — AWS region (e.g. ap-south-1)
 *        sender_id              — Alphanumeric sender ID (where supported)
 *   3. Replace stub methods with real SNS SDK calls.
 *      See: https://docs.aws.amazon.com/sns/latest/dg/sns-mobile-phone-number-as-subscriber.html
 *
 * NOTE: AWS SNS does not support DLT sender IDs natively for India.
 *       Consider using AWS Pinpoint or a third-party DLT-compliant route.
 *
 * TODO: AI — SNS usage metrics can feed into a cost-optimisation model.
 *       Compare per-message cost across SNS / MSG91 / Twilio and dynamically
 *       route to the cheapest provider that meets the SLA.
 */

import type { SMSProvider, ProviderConfig, SendOTPParams, SendSMSParams, SMSResult } from '../types'
import { ProviderError } from '../types'

const NOT_IMPLEMENTED_MSG =
  'AWS SNS is not yet implemented. Configure AWS credentials in Admin → Settings → Providers and complete the SNS provider implementation.'

export class AWSSNSProvider implements SMSProvider {
  readonly name = 'aws_sns' as const

  constructor(_config: ProviderConfig) {
    // Config accepted but not used until implementation is complete
  }

  sendOTP(_params: SendOTPParams): Promise<SMSResult> {
    throw new ProviderError('aws_sns', null, NOT_IMPLEMENTED_MSG)
  }

  sendTransactional(_params: SendSMSParams): Promise<SMSResult> {
    throw new ProviderError('aws_sns', null, NOT_IMPLEMENTED_MSG)
  }
}
