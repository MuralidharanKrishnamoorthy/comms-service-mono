import { randomUUID } from 'node:crypto'
import type { Channel } from '../models/project.js'
import type { EmailPayload, PushPayload, SendResult, SmsPayload } from './types.js'

export type ChannelPayload = EmailPayload | SmsPayload | PushPayload

export interface ProviderConfig {
  url: string
  auth: string
  format: 'json' | 'form'
  body: string
  idPath: string
  headers?: Record<string, string>
}

export class SendError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'SendError'
    this.retryable = retryable
  }
}

export function isRetryable(err: unknown): boolean {
  return err instanceof SendError ? err.retryable : true
}

const PRESETS: Record<string, Partial<Record<Channel, ProviderConfig>>> = {
  resend: {
    email: {
      url: 'https://api.resend.com/emails',
      auth: 'Bearer ${RESEND_API_KEY}',
      format: 'json',
      body: '{"from":"${RESEND_FROM_ADDRESS}","to":"{{to}}","subject":"{{subject}}","html":"{{html}}"}',
      idPath: 'body.id',
    },
  },
  sendgrid: {
    email: {
      url: 'https://api.sendgrid.com/v3/mail/send',
      auth: 'Bearer ${SENDGRID_API_KEY}',
      format: 'json',
      body:
        '{"personalizations":[{"to":[{"email":"{{to}}"}]}],"from":{"email":"${SENDGRID_FROM_ADDRESS}"},' +
        '"subject":"{{subject}}","content":[{"type":"text/html","value":"{{html}}"}]}',
      idPath: 'header.x-message-id',
    },
  },
  mailgun: {
    email: {
      url: 'https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages',
      auth: 'Basic api:${MAILGUN_API_KEY}',
      format: 'form',
      body: 'from=${MAILGUN_FROM_ADDRESS}&to={{to}}&subject={{subject}}&html={{html}}',
      idPath: 'body.id',
    },
  },
  postmark: {
    email: {
      url: 'https://api.postmarkapp.com/email',
      auth: 'none',
      format: 'json',
      body: '{"From":"${POSTMARK_FROM_ADDRESS}","To":"{{to}}","Subject":"{{subject}}","HtmlBody":"{{html}}"}',
      idPath: 'body.MessageID',
      headers: { 'X-Postmark-Server-Token': '${POSTMARK_SERVER_TOKEN}' },
    },
  },
  twilio: {
    sms: {
      url: 'https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json',
      auth: 'Basic ${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}',
      format: 'form',
      body: 'From=${TWILIO_FROM_NUMBER}&To={{to}}&Body={{body}}',
      idPath: 'body.sid',
    },
  },
  onesignal: {
    email: {
      url: 'https://api.onesignal.com/notifications',
      auth: 'Basic ${ONESIGNAL_API_KEY}',
      format: 'json',
      body:
        '{"app_id":"${ONESIGNAL_APP_ID}","include_email_tokens":["{{to}}"],' +
        '"email_subject":"{{subject}}","email_body":"{{html}}"}',
      idPath: 'body.id',
    },
    sms: {
      url: 'https://api.onesignal.com/notifications',
      auth: 'Basic ${ONESIGNAL_API_KEY}',
      format: 'json',
      body:
        '{"app_id":"${ONESIGNAL_APP_ID}","include_phone_numbers":["{{to}}"],' +
        '"sms_from":"${ONESIGNAL_SMS_FROM}","contents":{"en":"{{body}}"}}',
      idPath: 'body.id',
    },
    push: {
      url: 'https://api.onesignal.com/notifications',
      auth: 'Basic ${ONESIGNAL_API_KEY}',
      format: 'json',
      body:
        '{"app_id":"${ONESIGNAL_APP_ID}","include_subscription_ids":["{{to}}"],' +
        '"headings":{"en":"{{title}}"},"contents":{"en":"{{body}}"}}',
      idPath: 'body.id',
    },
  },
}

const CHANNEL_PREFIX: Record<Channel, string> = {
  email: 'EMAIL',
  sms: 'SMS',
  push: 'PUSH',
}

function expandEnv(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name: string) => {
    const found = process.env[name]
    if (found === undefined) {
      throw new Error(`${name} is referenced by the provider configuration but is not set in backend/.env`)
    }
    return found
  })
}

function readConfig(channel: Channel): ProviderConfig | 'stub' {
  const prefix = CHANNEL_PREFIX[channel]
  const name = (process.env[`${prefix}_PROVIDER`] ?? 'stub').toLowerCase()

  if (name === 'stub') return 'stub'

  if (name === 'custom') {
    const url = process.env[`${prefix}_URL`]
    const body = process.env[`${prefix}_BODY`]
    const idPath = process.env[`${prefix}_ID_PATH`]
    if (!url || !body || !idPath) {
      throw new Error(
        `${prefix}_PROVIDER=custom requires ${prefix}_URL, ${prefix}_BODY and ${prefix}_ID_PATH in backend/.env`
      )
    }
    return {
      url,
      body,
      idPath,
      auth: process.env[`${prefix}_AUTH`] ?? 'none',
      format: (process.env[`${prefix}_FORMAT`] ?? 'json') === 'form' ? 'form' : 'json',
    }
  }

  const preset = PRESETS[name]?.[channel]
  if (!preset) {
    const supported = Object.entries(PRESETS)
      .filter(([, channels]) => channels[channel])
      .map(([key]) => key)
    throw new Error(
      `${prefix}_PROVIDER="${name}" is not a known ${channel} provider. ` +
        `Known: ${supported.join(', ')}, stub, custom. ` +
        `For anything else set ${prefix}_PROVIDER=custom and supply ${prefix}_URL, ${prefix}_AUTH, ${prefix}_BODY, ${prefix}_ID_PATH.`
    )
  }
  return preset
}

function authHeader(spec: string): Record<string, string> {
  const resolved = expandEnv(spec).trim()
  if (!resolved || resolved.toLowerCase() === 'none') return {}

  if (resolved.startsWith('Basic ')) {
    const credentials = resolved.slice('Basic '.length)
    const encoded = credentials.includes(':')
      ? Buffer.from(credentials).toString('base64')
      : credentials
    return { Authorization: `Basic ${encoded}` }
  }

  return { Authorization: resolved }
}

function fillLeaves(node: unknown, values: Record<string, string>): unknown {
  if (typeof node === 'string') {
    return node.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => values[key] ?? '')
  }
  if (Array.isArray(node)) return node.map((item) => fillLeaves(item, values))
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, fillLeaves(v, values)])
    )
  }
  return node
}

function buildBody(config: ProviderConfig, values: Record<string, string>): string {
  const withEnv = expandEnv(config.body)

  if (config.format === 'form') {
    const params = new URLSearchParams()
    for (const pair of withEnv.split('&')) {
      if (!pair) continue
      const index = pair.indexOf('=')
      const key = index === -1 ? pair : pair.slice(0, index)
      const raw = index === -1 ? '' : pair.slice(index + 1)
      params.set(key, raw.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => values[name] ?? ''))
    }
    return params.toString()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(withEnv)
  } catch {
    throw new Error('The provider body template is not valid JSON. Check the *_BODY value in backend/.env')
  }
  return JSON.stringify(fillLeaves(parsed, values))
}

function extractId(path: string, headers: Headers, body: unknown): string | undefined {
  if (path.startsWith('header.')) {
    return headers.get(path.slice('header.'.length)) ?? undefined
  }

  const segments = path.replace(/^body\./, '').split('.')
  let current: unknown = body
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current === undefined || current === null ? undefined : String(current)
}

function payloadValues(payload: ChannelPayload): Record<string, string> {
  const anyPayload = payload as EmailPayload & SmsPayload & PushPayload
  return {
    to: anyPayload.to ?? '',
    subject: anyPayload.subject ?? '',
    html: anyPayload.html ?? '',
    body: anyPayload.body ?? '',
    title: anyPayload.title ?? '',
  }
}

export async function sendViaProvider(channel: Channel, payload: ChannelPayload): Promise<SendResult> {
  const config = readConfig(channel)

  if (config === 'stub') {
    console.log(`[stub ${channel}]`, payloadValues(payload))
    return { providerMessageId: `stub_${channel}_${randomUUID()}` }
  }

  const values = payloadValues(payload)
  const contentType =
    config.format === 'form' ? 'application/x-www-form-urlencoded' : 'application/json'

  const extraHeaders = Object.fromEntries(
    Object.entries(config.headers ?? {}).map(([k, v]) => [k, expandEnv(v)])
  )

  let response: Response
  try {
    response = await fetch(expandEnv(config.url), {
      method: 'POST',
      headers: { 'Content-Type': contentType, ...authHeader(config.auth), ...extraHeaders },
      body: buildBody(config, values),
    })
  } catch (err) {
    throw new SendError(`Could not reach the ${channel} provider: ${(err as Error).message}`, true)
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : undefined
  } catch {
    parsed = text
  }

  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500
    throw new SendError(
      `${channel} provider rejected the message (${response.status}): ${text.slice(0, 300)}`,
      retryable
    )
  }

  const providerMessageId = extractId(config.idPath, response.headers, parsed)
  if (!providerMessageId) {
    throw new SendError(
      `The ${channel} provider accepted the message but no id was found at "${config.idPath}"`,
      false
    )
  }

  return { providerMessageId, raw: parsed }
}
