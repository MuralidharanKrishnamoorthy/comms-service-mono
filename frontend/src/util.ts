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

// Tolerates a single formatting tag wrapping just the inner name (e.g. bolding
// only "user_name" inside "{{user_name}}" in the rich text editor splits it
// into "{{<strong>user_name</strong>}}") so it's still detected as one token —
// must stay in sync with the same tolerant pattern in backend/src/lib/template.ts.
// Exactly the charset backend/src/lib/template.ts substitutes. Keep them
// identical: a name this accepts but the backend doesn't would show a sample
// row here and then ship unreplaced.
const VARIABLE_NAME = '[a-zA-Z0-9_]+'
const VARIABLE_SOURCE = `\\{\\{\\s*(?:</?[a-zA-Z][^>]*>\\s*)*(${VARIABLE_NAME})\\s*(?:</?[a-zA-Z][^>]*>\\s*)*\\}\\}`

// Extract {{variable}} tokens from a piece of content, in first-seen order.
export function extractVariables(...parts: (string | undefined)[]): string[] {
  const seen: string[] = []
  const re = new RegExp(VARIABLE_SOURCE, 'g')
  for (const part of parts) {
    if (!part) continue
    let m: RegExpExecArray | null
    while ((m = re.exec(part)) !== null) {
      if (!seen.includes(m[1])) seen.push(m[1])
    }
  }
  return seen
}

/**
 * The token "+ Add variable" inserts. A real name rather than a bare {{}},
 * which matches nothing and so would never produce a row to fill in — and a
 * name rather than a number, because the sending app supplies its data keyed
 * by name: `data: { coupon_code: "…" }`.
 *
 * It's a starting point to rename. Only variable_N names are counted, so
 * hand-typed ones sit alongside without disturbing the sequence.
 */
export function nextVariableToken(vars: string[]): string {
  let highest = 0
  for (const v of vars) {
    const numbered = /^variable_(\d+)$/.exec(v)
    if (numbered) highest = Math.max(highest, Number(numbered[1]))
  }
  return `{{variable_${highest + 1}}}`
}

// Anything between double braces, valid or not.
const ANY_TOKEN_SOURCE = '\\{\\{([\\s\\S]*?)\\}\\}'

/**
 * Braces that look like a variable but can't be one — `{{coupon code}}`,
 * `{{order.id}}`, `{{}}`. They're silently left alone at send time, so the
 * author has to be told rather than left wondering why no row appeared.
 */
export function invalidVariableTokens(...parts: (string | undefined)[]): string[] {
  const bad: string[] = []
  const valid = new RegExp(`^${VARIABLE_SOURCE}$`)

  for (const part of parts) {
    if (!part) continue
    const re = new RegExp(ANY_TOKEN_SOURCE, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(part)) !== null) {
      if (valid.test(m[0])) continue
      // Strip any formatting tags so the warning shows what was typed.
      const shown = m[0].replace(/<[^>]*>/g, '')
      if (!bad.includes(shown)) bad.push(shown)
    }
  }
  return bad
}

/** The nearest legal name for an invalid token, to suggest in the warning. */
export function suggestVariableName(token: string): string {
  const inner = token.replace(/^\{\{|\}\}$/g, '').replace(/<[^>]*>/g, '').trim()
  const cleaned = inner
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
  return cleaned || 'variable_1'
}

// What the rich-text editor can hold without losing anything. Everything else
// — tables, divs, layout attributes, a full document — is discarded on the way
// in, so a body containing any of it can only be edited as source.
const RICH_TEXT_TAGS = new Set([
  'p', 'br', 'span', 'a', 'img', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
])

// Attributes that only appear in hand-built email layouts.
const LAYOUT_ATTRIBUTES = /\s(bgcolor|cellpadding|cellspacing|valign|align|width|height|role|border)\s*=/i

// The rich editor keeps inline styles only on these. `mark` carries the
// highlight colour the editor itself writes, and parses it back unchanged.
const STYLEABLE = new Set(['span', 'img', 'mark'])

/**
 * Can the rich-text editor round-trip this HTML without dropping anything?
 *
 * The Text and HTML tabs edit one field, but the rich editor stores its own
 * document model rather than markup — switching a table-based template into it
 * flattens the table to paragraphs, and the first keystroke commits that. So
 * the Text tab has to be closed off for anything it cannot represent.
 */
export function isRichTextSafe(html: string): boolean {
  if (!html.trim()) return true
  if (/<!doctype|<html[\s>]/i.test(html)) return false

  for (const [, tag, attrs] of html.matchAll(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
    const name = tag.toLowerCase()
    if (!RICH_TEXT_TAGS.has(name)) return false
    if (LAYOUT_ATTRIBUTES.test(attrs)) return false
    if (/\sstyle\s*=/i.test(attrs) && !STYLEABLE.has(name)) return false
  }

  return true
}

// Six accent colours, matching the category palette in index.css. A variable
// keeps the same colour in the sample-value row and in the preview, so you can
// see at a glance which words came from which placeholder.
export const SWATCH_COUNT = 6

/** True when `index` falls between a "<" and its closing ">". */
function insideTag(source: string, index: number): boolean {
  return source.lastIndexOf('<', index) > source.lastIndexOf('>', index)
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )
}

/**
 * Renders content the way it will read once the variables are filled in.
 *
 * A variable with a sample value is replaced by it; one without keeps showing
 * its `{{token}}` so an unfilled placeholder stays obvious rather than leaving
 * a hole. Either way it's wrapped in a swatch span for colour-coding.
 *
 * Sample values are typed by the user and land in `dangerouslySetInnerHTML`,
 * so they are always escaped. `sourceIsHtml` says whether the surrounding
 * content is already markup (the email body) or plain text that needs escaping
 * too (SMS and push).
 */
export function substituteVariables(
  source: string,
  samples: Record<string, string>,
  sourceIsHtml: boolean
): string {
  const re = new RegExp(VARIABLE_SOURCE, 'g')
  const keep = (text: string) => (sourceIsHtml ? text : escapeHtml(text))

  let out = ''
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(source)) !== null) {
    out += keep(source.slice(last, m.index))

    const sample = samples[m[1]]?.trim()

    if (sourceIsHtml && insideTag(source, m.index)) {
      // A variable used inside a tag — href="{{url}}", src="{{logo}}" — must
      // be substituted as plain text. Wrapping it in a <span> there would
      // close the attribute early and spill the rest of the tag onto the page.
      out += escapeHtml(sample ?? m[0])
    } else {
      // A filled value is rendered exactly as it will be delivered — no accent
      // colour, since the channel would not carry one. Only a token still
      // waiting for a value is marked, and that marks a gap, not a style.
      out += sample
        ? `<span class="var-filled">${escapeHtml(sample)}</span>`
        : `<span class="var-unset">${escapeHtml(m[0])}</span>`
    }

    last = m.index + m[0].length
  }

  return out + keep(source.slice(last))
}

// Mirrors backend/src/lib/template.ts's wrapEmailHtml — the dashboard preview
// must show exactly what actually gets sent. A template that's already a
// full HTML document is left untouched; a plain body fragment gets a minimal
// default shell so it still looks like a designed email.
const FULL_DOCUMENT_PATTERN = /<!doctype html|<html[\s>]/i

/**
 * Bold and italic that survive a plain-text channel.
 *
 * SMS carries only GSM 03.38 or UCS-2 text and push bodies are plain strings,
 * so there is no markup to send. Unicode's Mathematical Alphanumeric Symbols
 * are real characters, so 𝗯𝗼𝗹𝗱 renders styled with no help from the carrier.
 * Mirrors backend/src/lib/unicodeStyle.ts — keep the two in step.
 */
const ALPHABETS = {
  bold: { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec },
  italic: { upper: 0x1d608, lower: 0x1d622, digit: null },
  boldItalic: { upper: 0x1d63c, lower: 0x1d656, digit: null },
} as const

function toUnicodeStyle(text: string, style: keyof typeof ALPHABETS): string {
  const alphabet = ALPHABETS[style]
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (code >= 0x41 && code <= 0x5a) out += String.fromCodePoint(alphabet.upper + code - 0x41)
    else if (code >= 0x61 && code <= 0x7a) out += String.fromCodePoint(alphabet.lower + code - 0x61)
    else if (alphabet.digit !== null && code >= 0x30 && code <= 0x39) {
      out += String.fromCodePoint(alphabet.digit + code - 0x30)
    } else out += ch
  }
  return out
}

function addCombining(text: string, mark: string): string {
  let out = ''
  for (const ch of text) out += ch === '\n' || ch === ' ' ? ch : ch + mark
  return out
}

function styleRun(text: string, active: Set<string>): string {
  const bold = active.has('bold')
  const italic = active.has('italic')
  let out = text

  if (bold && italic) out = toUnicodeStyle(out, 'boldItalic')
  else if (bold) out = toUnicodeStyle(out, 'bold')
  else if (italic) out = toUnicodeStyle(out, 'italic')

  if (active.has('underline')) out = addCombining(out, '̲')
  if (active.has('strike')) out = addCombining(out, '̶')

  return out
}

// Markers recording the style around a {{token}}, so it can be applied to the
// substituted value instead. Mirrors backend/src/lib/unicodeStyle.ts.
const DEFERRED = /([bius]*)([\s\S]*?)/g
const FLAGS: Record<string, string> = { bold: 'b', italic: 'i', underline: 'u', strike: 's' }
const STYLES: Record<string, string> = { b: 'bold', i: 'italic', u: 'underline', s: 'strike' }

/**
 * A {{token}} is not styled in place — its letters would end up spelled in
 * Mathematical Alphanumerics and the backend would no longer match the name,
 * so the variable would ship unsubstituted. The style is recorded around it
 * and applied to the value by applyDeferredStyles after substitution.
 */
function applyStyles(text: string, active: Set<string>): string {
  if (!text || active.size === 0) return text

  const flags = Object.keys(FLAGS)
    .filter((style) => active.has(style))
    .map((style) => FLAGS[style])
    .join('')

  const pattern = /\{\{[^{}]*\}\}/g
  let out = ''
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    out += styleRun(text.slice(last, match.index), active) + `${flags}${match[0]}`
    last = match.index + match[0].length
  }

  return out + styleRun(text.slice(last), active)
}

/**
 * Styles the values that landed where styled {{tokens}} were. Run after
 * substitution, never before.
 *
 * `insideHtml` is for the preview, where each value has already been wrapped
 * in its colour-swatch span — only the text between tags is styled, so the
 * markup itself is not turned into Mathematical Alphanumerics.
 */
export function applyDeferredStyles(text: string, insideHtml = false): string {
  if (!text.includes('')) return text

  return text
    .replace(DEFERRED, (_full, flags: string, value: string) => {
      // Still a bare token, so no sample value was given — styling it would
      // leave the name unreadable rather than obviously unfilled.
      if (/^\{\{[^{}]*\}\}$/.test(value.replace(/<[^>]+>/g, ''))) return value

      const active = new Set([...flags].map((f) => STYLES[f]))
      if (!insideHtml) return styleRun(value, active)
      return value.replace(/>([^<]+)</g, (_m, inner: string) => `>${styleRun(inner, active)}<`)
    })
    .replace(/[]/g, '')
}

function styleForTag(tag: string): string | null {
  switch (tag.toLowerCase()) {
    case 'b':
    case 'strong':
      return 'bold'
    case 'i':
    case 'em':
      return 'italic'
    case 'u':
    case 'ins':
      return 'underline'
    case 's':
    case 'strike':
    case 'del':
      return 'strike'
    default:
      return null
  }
}

const STYLE_TAG_PATTERN = /<\/?\s*(b|strong|i|em|u|ins|s|strike|del)\b[^>]*>/gi

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/gi, '&')
}

function styleInline(html: string): string {
  const open: string[] = []
  const pattern = new RegExp(STYLE_TAG_PATTERN.source, 'gi')

  let out = ''
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null) {
    out += applyStyles(decodeEntities(html.slice(last, match.index)), new Set(open))
    const style = styleForTag(match[1])
    if (style) {
      if (match[0].startsWith('</')) {
        const at = open.lastIndexOf(style)
        if (at >= 0) open.splice(at, 1)
      } else {
        open.push(style)
      }
    }
    last = match.index + match[0].length
  }

  return out + applyStyles(decodeEntities(html.slice(last)), new Set(open))
}

/**
 * Mirrors backend/src/lib/template.ts's htmlToPlainText — the preview has to
 * show exactly the text that will be delivered, Unicode styling included.
 */
export function htmlToPlainText(html: string, styleWithUnicode = false): string {
  if (!/[<&]/.test(html)) return html

  const blocks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    // Not </li> — the opening <li> already started that line.
    .replace(/<\s*\/\s*(p|div|h[1-6]|ul|ol|tr)\s*>/gi, '\n')

  const kept = blocks.replace(/<(?!\/?\s*(?:b|strong|i|em|u|ins|s|strike|del)\b)[^>]+>/gi, '')

  const styled = styleWithUnicode
    ? styleInline(kept)
    : decodeEntities(kept.replace(STYLE_TAG_PATTERN, ''))

  return styled
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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
