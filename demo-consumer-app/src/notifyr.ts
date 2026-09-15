const BASE_URL = (process.env.COMMS_BASE_URL ?? '').replace(/\/+$/, '')
const API_KEY = process.env.COMMS_API_KEY ?? ''

type Channel = 'email' | 'sms' | 'push'

interface SendInput {
  template_key: string
  channel: Channel
  recipient: string
  /** Flat primitives only — Notifyr substitutes these into {{tokens}}. */
  data: Record<string, string | number>
}

interface SendOutcome {
  ok: boolean
  /** Notifyr's HTTP status, or 0 if it could not be reached. */
  status: number
  body: unknown
}

export function config() {
  return {
    configured: BASE_URL.length > 0 && API_KEY.length > 0,
    baseUrl: BASE_URL || '(COMMS_BASE_URL not set)',
    keyPrefix: API_KEY ? `${API_KEY.slice(0, 15)}…` : '(COMMS_API_KEY not set)',
  }
}

/**
 * The only place this app talks to Notifyr.
 *
 * No retry loop here on purpose: Notifyr records a send before it attempts it
 * and retries on its own, so retrying would mail the customer twice.
 */
export async function sendNotification(input: SendInput): Promise<SendOutcome> {
  if (!config().configured) {
    return {
      ok: false,
      status: 0,
      body: { error: 'Set COMMS_BASE_URL and COMMS_API_KEY in .env, then restart.' },
    }
  }

  let res: Response
  try {
    res = await fetch(`${BASE_URL}/v1/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(input),
    })
  } catch {
    return { ok: false, status: 0, body: { error: `Could not reach Notifyr at ${BASE_URL}` } }
  }

  const body = await res.json().catch(() => ({ error: 'Notifyr returned a non-JSON response' }))
  return { ok: res.ok, status: res.status, body }
}
