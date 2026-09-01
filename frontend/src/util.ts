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

// Replace {{var}} tokens with sample data for the live preview.
export function renderSample(content: string, variables: string[]): string {
  let out = content
  for (const v of variables) {
    const sample = sampleFor(v)
    out = out.replace(new RegExp(`\\{\\{\\s*${escapeRegExp(v)}\\s*\\}\\}`, 'g'), sample)
  }
  return out
}

function sampleFor(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('name')) return 'Arjun'
  if (n.includes('code') || n.includes('otp')) return '482913'
  if (n.includes('email')) return 'arjun@example.com'
  if (n.includes('url') || n.includes('link')) return 'https://example.com/x'
  if (n.includes('amount') || n.includes('price')) return '₹1,299'
  if (n.includes('date')) return '1 Sep 2026'
  return `{${name}}`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
