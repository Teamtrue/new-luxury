/**
 * lib/providers/sms/twilio.ts
 *
 * Twilio SMS provider implementation using the Twilio REST API.
 *
 * No Twilio SDK is used — plain fetch with Basic auth to keep the bundle
 * minimal and avoid a heavyweight optional dependency.
 *
 * Required keys in provider_config.config_encrypted:
 *   account_sid  — Twilio Account SID (ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)
 *   auth_token   — Twilio Auth Token
 *   from_number  — Twilio phone number or Messaging Service SID in E.164
 *                  format (e.g. +12015551234) or MG... SID
 *
 * API Reference:
 *   https://www.twilio.com/docs/sms/api/message-resource#create-a-message-resource
 *
 * TODO: AI — Integrate Twilio Lookup API before sending to validate that the
 *       destination number is a reachable mobile (not a landline).  Cache
 *       Lookup results in Supabase to avoid repeated API charges on the same
 *       number.
 */

import type { SMSProvider, ProviderConfig, SendOTPParams, SendSMSParams, SMSResult } from '../types'
import { ProviderError } from '../types'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface TwilioMessageResponse {
  sid: string
  status: string
  error_code?: number | null
  error_message?: string | null
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class TwilioProvider implements SMSProvider {
  readonly name = 'twilio' as const

  private readonly accountSid: string
  private readonly authToken: string
  private readonly fromNumber: string
  private readonly basicAuth: string
  private readonly apiUrl: string

  constructor(config: ProviderConfig) {
    const { account_sid, auth_token, from_number } = config.config

    if (!account_sid) {
      throw new ProviderError('twilio', null, 'Twilio config missing account_sid.')
    }
    if (!auth_token) {
      throw new ProviderError('twilio', null, 'Twilio config missing auth_token.')
    }
    if (!from_number) {
      throw new ProviderError('twilio', null, 'Twilio config missing from_number.')
    }

    this.accountSid = account_sid
    this.authToken = auth_token
    this.fromNumber = from_number
    // Basic auth: base64(account_sid:auth_token)
    this.basicAuth = Buffer.from(`${account_sid}:${auth_token}`).toString('base64')
    this.apiUrl = `https://api.twilio.com/2010-04-01/Accounts/${account_sid}/Messages.json`
  }

  // -------------------------------------------------------------------------
  // Internal: send a message via Twilio REST API
  // -------------------------------------------------------------------------

  private async sendMessage(to: string, body: string): Promise<SMSResult> {
    const formData = new URLSearchParams()
    formData.set('To', to)
    formData.set('From', this.fromNumber)
    formData.set('Body', body)

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    const text = await response.text()
    let json: TwilioMessageResponse

    try {
      json = JSON.parse(text) as TwilioMessageResponse
    } catch {
      throw new Error(`Non-JSON Twilio response (HTTP ${response.status}): ${text.slice(0, 200)}`)
    }

    if (!response.ok || json.error_code) {
      const detail = json.error_message ?? `HTTP ${response.status}`
      throw new Error(`Twilio error ${json.error_code ?? response.status}: ${detail}`)
    }

    // Map Twilio status strings to our SMSResult status
    const status: SMSResult['status'] =
      json.status === 'sent' || json.status === 'delivered'
        ? 'sent'
        : json.status === 'queued' || json.status === 'accepted' || json.status === 'sending'
        ? 'queued'
        : 'failed'

    return { messageId: json.sid, status }
  }

  // -------------------------------------------------------------------------
  // sendOTP
  // -------------------------------------------------------------------------

  async sendOTP(params: SendOTPParams): Promise<SMSResult> {
    const { phone, otp, expiryMinutes } = params
    const message = `Your PlutusClub OTP is ${otp}. Valid for ${expiryMinutes} minute${expiryMinutes !== 1 ? 's' : ''}. Do not share this with anyone.`

    try {
      return await this.sendMessage(phone, message)
    } catch (err) {
      throw new ProviderError(
        'twilio',
        err,
        `Twilio OTP send failed for ${phone}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  // -------------------------------------------------------------------------
  // sendTransactional
  // -------------------------------------------------------------------------

  async sendTransactional(params: SendSMSParams): Promise<SMSResult> {
    const { phone, message } = params

    try {
      return await this.sendMessage(phone, message)
    } catch (err) {
      throw new ProviderError(
        'twilio',
        err,
        `Twilio transactional SMS send failed for ${phone}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}
