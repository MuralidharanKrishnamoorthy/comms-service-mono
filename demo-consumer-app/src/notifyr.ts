
const BASE_URL = (process.env.COMMS_BASE_URL ?? '').replace(/\/+$/, '')
const API_KEY = process.env.COMMS_API_KEY ?? ''

export type Channel = 'email' | 'sms' | 'push'

export interface SendInput {
  template_key: string
  channel: Channel
  recipient: string
  /** Flat primitives only — Notifyr substitutes these into {{tokens}}. */
  data: Record<string, string | number>
}

export interface SendOutcome {
  ok: boolean
  /** HTTP status from Notifyr, or 0 if the service could not be reached. */
  status: number
  /** Exactly what went over the wire, so the demo can show it verbatim. */
  request: SendInput
  body: unknown
}

export interface NotifyrConfig {
  configured: boolean
  baseUrl: string
  /** Non-secret leading portion of the key, for display. Never the whole key. */
  keyPrefix: string
}

/** What is safe to show on a screen or log line. Never the key itself. */
export function config(): NotifyrConfig {
  return {
    configured: BASE_URL.length > 0 && API_KEY.length > 0,
    baseUrl: BASE_URL || '(COMMS_BASE_URL not set)',
    keyPrefix: API_KEY ? `${API_KEY.slice(0, 15)}…` : '(COMMS_API_KEY not set)',
  }
}

export async function sendNotification(input: SendInput): Promise<SendOutcome> {
  if (!config().configured) {
    return {
      ok: false,
      status: 0,
      request: input,
      body: {
        error:
          'This app has no Notifyr credentials. Set COMMS_BASE_URL and COMMS_API_KEY ' +
          'in demo-consumer-app/.env, then restart it.',
      },
    }
  }

  let res: Response
  try {
    res = await fetch(`${BASE_URL}/v1/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(input),
    })
  } catch (err) {
    // Notifyr itself is down or unreachable. Nothing was recorded on its side,
    // so this is the one case where the caller may safely try again later.
    return {
      ok: false,
      status: 0,
      request: input,
      body: { error: `Could not reach Notifyr at ${BASE_URL}`, detail: String(err) },
    }
  }

  const body = await res.json().catch(() => ({ error: 'Notifyr returned a non-JSON response' }))
  return { ok: res.ok, status: res.status, request: input, body }
}
