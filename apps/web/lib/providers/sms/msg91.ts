/**
 * lib/providers/sms/msg91.ts
 *
 * MSG91 SMS provider implementation using the MSG91 REST API v5.
 *
 * Required keys in provider_config.config_encrypted:
 *   auth_key                — MSG91 API authentication key
 *   sender_id               — 6-character DLT-registered sender ID (e.g. PLUTUS)
 *   otp_template_id         — DLT-approved OTP template ID
 *   transactional_flow_id   — MSG91 Flow ID for transactional messages
 *
 * API Reference:
 *   OTP:           https://docs.msg91.com/reference/send-otp
 *   Send message:  https://docs.msg91.com/reference/send-transactional-sms
 *
 * NOTE: All production SMS in India must use TRAI DLT-registered sender IDs
 *       and template IDs.  Using unregistered content will be blocked by telcos.
 *
 * TODO: AI — Analyse OTP delivery failure rates by telecom circle and time of
 *       day.  Automatically retry via an alternate SMS provider (Twilio) when
 *       MSG91 failure rate exceeds 5 % in a rolling 10-minute window.
 */

import type { SMSProvider, ProviderConfig, SendOTPParams, SendSMSParams, SMSResult } from '../types'
import { ProviderError } from '../types'

const MSG91_BASE = 'https://control.msg91.com/api/v5'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface MSG91OTPResponse {
  type: string
  message: string
  request_id?: string
}

interface MSG91FlowResponse {
  type: string
  request_id?: string
  message?: string
}

async function postJSON<T>(
  url: string,
  body: Record<string, unknown>,
  authKey: string
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authkey': authKey,
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON response (HTTP ${response.status}): ${text.slice(0, 200)}`)
  }

  if (!response.ok) {
    const errMsg =
      (json as Record<string, unknown>)?.['message'] ??
      (json as Record<string, unknown>)?.['error'] ??
      `HTTP ${response.status}`
    throw new Error(String(errMsg))
  }

  return json as T
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class MSG91Provider implements SMSProvider {
  readonly name = 'msg91' as const

  private readonly authKey: string
  private readonly senderId: string
  private readonly otpTemplateId: string
  private readonly transactionalFlowId: string

  constructor(config: ProviderConfig) {
    const { auth_key, sender_id, otp_template_id, transactional_flow_id } = config.config

    if (!auth_key) {
      throw new ProviderError('msg91', null, 'MSG91 config missing auth_key.')
    }
    if (!sender_id) {
      throw new ProviderError('msg91', null, 'MSG91 config missing sender_id.')
    }
    if (!otp_template_id) {
      throw new ProviderError('msg91', null, 'MSG91 config missing otp_template_id.')
    }
    if (!transactional_flow_id) {
      throw new ProviderError('msg91', null, 'MSG91 config missing transactional_flow_id.')
    }

    this.authKey = auth_key
    this.senderId = sender_id
    this.otpTemplateId = otp_template_id
    this.transactionalFlowId = transactional_flow_id
  }

  // -------------------------------------------------------------------------
  // sendOTP
  // -------------------------------------------------------------------------

  async sendOTP(params: SendOTPParams): Promise<SMSResult> {
    const { phone, otp, expiryMinutes } = params

    // MSG91 expects mobile number without the leading + for Indian numbers
    // but accepts E.164 for international.  Strip the + for compatibility.
    const mobile = phone.startsWith('+') ? phone.slice(1) : phone

    let resp: MSG91OTPResponse
    try {
      resp = await postJSON<MSG91OTPResponse>(
        `${MSG91_BASE}/otp`,
        {
          template_id: this.otpTemplateId,
          mobile,
          otp,
          expiry: expiryMinutes,
          sender: this.senderId,
        },
        this.authKey
      )
    } catch (err) {
      throw new ProviderError(
        'msg91',
        err,
        `MSG91 OTP send failed for ${mobile}: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    if (resp.type !== 'success') {
      throw new ProviderError(
        'msg91',
        resp,
        `MSG91 OTP API returned non-success: ${resp.message}`
      )
    }

    return {
      messageId: resp.request_id ?? `msg91-otp-${Date.now()}`,
      status: 'sent',
    }
  }

  // -------------------------------------------------------------------------
  // sendTransactional
  // -------------------------------------------------------------------------

  async sendTransactional(params: SendSMSParams): Promise<SMSResult> {
    const { phone, message } = params

    const mobile = phone.startsWith('+') ? phone.slice(1) : phone

    let resp: MSG91FlowResponse
    try {
      resp = await postJSON<MSG91FlowResponse>(
        `${MSG91_BASE}/flow/`,
        {
          flow_id: this.transactionalFlowId,
          sender: this.senderId,
          mobiles: mobile,
          // The flow template should have a VAR1 placeholder for the message body.
          // Adjust variable names to match your DLT-registered template.
          VAR1: message,
        },
        this.authKey
      )
    } catch (err) {
      throw new ProviderError(
        'msg91',
        err,
        `MSG91 transactional SMS send failed for ${mobile}: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    if (resp.type !== 'success') {
      throw new ProviderError(
        'msg91',
        resp,
        `MSG91 Flow API returned non-success: ${resp.message ?? JSON.stringify(resp)}`
      )
    }

    return {
      messageId: resp.request_id ?? `msg91-sms-${Date.now()}`,
      status: 'sent',
    }
  }
}
