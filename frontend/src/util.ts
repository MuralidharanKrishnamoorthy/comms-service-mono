import type { Channel } from './types'

export const CHANNELS: Channel[] = ['email', 'sms', 'push']

export interface ReturnTarget {
  href: string
  label: string
}

export function linkWithReturn(to: string, from: string, fromLabel?: string): string {
  const params = new URLSearchParams({ from })
  if (fromLabel) params.set('from_label', fromLabel)
  return `${to}?${params.toString()}`
}

/**
 * Reads the return target out of a query string, falling back to the page's own
 * natural parent when there isn't one (a directly-opened or shared URL).
 *
 * Only internal, single-slash paths are honoured: an absolute URL or a
 * protocol-relative "//evil.example" is discarded, so a crafted link can't turn
 * a Back control into an off-site redirect.
 */
export function returnTarget(search: string, fallback: ReturnTarget): ReturnTarget {
  const params = new URLSearchParams(search)
  const from = params.get('from') ?? ''
  if (!from.startsWith('/') || from.startsWith('//')) return fallback

  const label = params.get('from_label')?.trim()
  return { href: from, label: label ? `Back to ${label}` : 'Back' }
}

// A disabled channel can be stored as `null` (older documents saved before
// the backend was fixed to omit them entirely) rather than simply absent —
// filter by truthiness, not just key presence, and always in a fixed order.
export function enabledChannels(channels: Partial<Record<Channel, unknown>>): Channel[] {
  return CHANNELS.filter((ch) => channels[ch])
}

// Extract {{variable}} tokens from a piece of content, in first-seen order.
// Tolerates a single formatting tag wrapping just the inner name (e.g. bolding
// only "user_name" inside "{{user_name}}" in the rich text editor splits it
// into "{{<strong>user_name</strong>}}") so it's still detected as one token —
// must stay in sync with the same tolerant pattern in backend/src/lib/template.ts.
export function extractVariables(...parts: (string | undefined)[]): string[] {
  const seen: string[] = []
  const re = /\{\{\s*(?:<\/?[a-zA-Z][^>]*>\s*)*([a-zA-Z0-9_.]+)\s*(?:<\/?[a-zA-Z][^>]*>\s*)*\}\}/g
  for (const part of parts) {
    if (!part) continue
    let m: RegExpExecArray | null
    while ((m = re.exec(part)) !== null) {
      if (!seen.includes(m[1])) seen.push(m[1])
    }
  }
  return seen
}

// Mirrors backend/src/lib/template.ts's wrapEmailHtml — the dashboard preview
// must show exactly what actually gets sent. A template that's already a
// full HTML document is left untouched; a plain body fragment gets a minimal
// default shell so it still looks like a designed email.
const FULL_DOCUMENT_PATTERN = /<!doctype html|<html[\s>]/i

export function wrapEmailHtml(bodyHtml: string): string {
  if (FULL_DOCUMENT_PATTERN.test(bodyHtml)) return bodyHtml
  return `<div style="background:#f5f6f4;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;color:#15181d;font-size:15px;line-height:1.6;">
    ${bodyHtml}
  </div>
</div>`
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
