import type { Channel } from './types'

export const CHANNELS: Channel[] = ['email', 'sms', 'push']

// Extract {{variable}} tokens from a piece of content, in first-seen order.
export function extractVariables(...parts: (string | undefined)[]): string[] {
  const seen: string[] = []
  const re = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g
  for (const part of parts) {
    if (!part) continue
    let m: RegExpExecArray | null
    while ((m = re.exec(part)) !== null) {
      if (!seen.includes(m[1])) seen.push(m[1])
    }
  }
  return seen
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
