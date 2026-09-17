const DAY_MS = 24 * 60 * 60 * 1000

export const DEFAULT_REMINDER_DAYS = 2
export const DEFAULT_REMINDER_HOUR_IST = 8
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

export interface ReminderSettings {
  enabled: boolean
  days: number
  hourIst: number
}

function positiveInt(raw: string | undefined, fallback: number, max: number): number {
  const parsed = raw === undefined ? fallback : Number(raw)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : fallback
}

export function readReminderSettings(env: NodeJS.ProcessEnv = process.env): ReminderSettings {
  const days = positiveInt(env.API_KEY_EXPIRY_REMINDER_DAYS, DEFAULT_REMINDER_DAYS, 365)

  return {
    enabled: env.API_KEY_EXPIRY_REMINDER_ENABLED !== 'false',
    days: days === 0 ? DEFAULT_REMINDER_DAYS : days,
    hourIst: positiveInt(env.API_KEY_EXPIRY_REMINDER_HOUR, DEFAULT_REMINDER_HOUR_IST, 23),
  }
}

export function msUntilNextRun(now: Date, hourIst: number): number {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  const next = new Date(ist)
  next.setUTCHours(hourIst, 0, 0, 0)
  if (next.getTime() <= ist.getTime()) next.setUTCDate(next.getUTCDate() + 1)
  return next.getTime() - ist.getTime()
}

export function reminderCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS)
}

export function isDueForReminder(
  key: { status: string; expires_at: Date | null; expiry_reminder_sent_at?: Date | null },
  now: Date,
  days: number
): boolean {
  if (key.status !== 'active') return false
  if (!key.expires_at) return false
  if (key.expiry_reminder_sent_at) return false

  const expiry = key.expires_at.getTime()
  return expiry > now.getTime() && expiry <= reminderCutoff(now, days).getTime()
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function formatExpiry(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS)
  const day = ist.getUTCDate()
  const month = MONTHS[ist.getUTCMonth()]
  const year = ist.getUTCFullYear()
  const hours = String(ist.getUTCHours()).padStart(2, '0')
  const minutes = String(ist.getUTCMinutes()).padStart(2, '0')
  return `${day} ${month} ${year} at ${hours}:${minutes} IST`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface ReminderContext {
  keyName: string
  keyPrefix: string
  projectName: string
  expiresAt: Date
  days: number
}

export function reminderSubject(ctx: ReminderContext): string {
  const when = ctx.days === 1 ? 'tomorrow' : `in ${ctx.days} days`
  return `Action required: your API key for ${ctx.projectName} expires ${when}`
}

export function reminderHtml(ctx: ReminderContext): string {
  const name = escapeHtml(ctx.keyName)
  const prefix = escapeHtml(ctx.keyPrefix)
  const project = escapeHtml(ctx.projectName)
  const when = escapeHtml(formatExpiry(ctx.expiresAt))

  return `<h2 style="margin:0 0 16px;font-size:19px;">Your API key is about to expire</h2>
<p style="margin:0 0 16px;">
  Your API key <strong>${name}</strong> for the project <strong>${project}</strong> will expire on
  <strong>${when}</strong>.
</p>
<p style="margin:0 0 16px;">
  Please generate a new API key before that date. If it is not replaced, every service using this
  key will stop working.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;font-size:15px;">
  <tr><td style="padding:4px 16px 4px 0;color:#5b6067;">Key</td><td style="padding:4px 0;">${name}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#5b6067;">Prefix</td><td style="padding:4px 0;font-family:'Courier New',monospace;">${prefix}…</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#5b6067;">Project</td><td style="padding:4px 0;">${project}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#5b6067;">Expires</td><td style="padding:4px 0;">${when}</td></tr>
</table>
<p style="margin:0 0 16px;">
  After it expires, every request made with this key is refused with
  <span style="font-family:'Courier New',monospace;">401 API key has expired</span>.
</p>
<p style="margin:0 0 16px;">
  To regenerate it: open the dashboard, create a new key for this project, update wherever the old
  one is used, then revoke the old key.
</p>
<p style="margin:0;color:#8d9298;font-size:13px;">
  This message never contains the key itself. The value is shown only once, when the key is created.
</p>`
}
