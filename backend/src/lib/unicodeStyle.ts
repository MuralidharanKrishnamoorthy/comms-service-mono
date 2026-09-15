/**
 * Bold and italic that survive SMS and push.
 *
 * Neither channel has markup in its wire format: SMS carries only GSM 03.38
 * or UCS-2 text, and APNs/FCM deliver the notification body as a plain string.
 * The old EMS extension did define bold/italic via the User Data Header, but it
 * was superseded by MMS and effectively no modern handset or aggregator
 * supports it.
 *
 * What does work is Unicode's Mathematical Alphanumeric Symbols block: 𝗯𝗼𝗹𝗱 and
 * 𝘪𝘵𝘢𝘭𝘪𝘤 are real codepoints, so they render styled anywhere the font has them,
 * with no cooperation needed from the carrier or handset. This is the same
 * technique commercial SMS vendors ship as a "rich fonts" feature.
 *
 * The costs are real and the caller should surface them:
 *  - They are outside GSM-7, so one styled character forces the whole message
 *    to UCS-2 and drops the segment size from 160 characters to 70.
 *  - They sit above the BMP, so each one costs two of those 70.
 *  - Screen readers announce them poorly, and copy-paste into a search box
 *    will not match the plain spelling. Use them for emphasis, not body text.
 *
 * Colour and highlight have no equivalent at all — there is no mechanism for
 * them in SMS, and none in the standard iOS or Android notification payload.
 */

type InlineStyle = 'bold' | 'italic' | 'boldItalic'

interface Alphabet {
  upper: number
  lower: number
  /** Italic has no styled digits; those are left as ASCII. */
  digit: number | null
}

// Sans-serif variants, which sit closest to the UI font on a handset.
const ALPHABETS: Record<InlineStyle, Alphabet> = {
  bold: { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec },
  italic: { upper: 0x1d608, lower: 0x1d622, digit: null },
  boldItalic: { upper: 0x1d63c, lower: 0x1d656, digit: null },
}

/** Combining marks, which work on any base character. */
const UNDERLINE = '̲'
const STRIKE = '̶'

function toUnicodeStyle(text: string, style: InlineStyle): string {
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

/** Adds a combining mark after every visible character. */
function addCombining(text: string, mark: string): string {
  let out = ''
  for (const ch of text) out += ch === '\n' || ch === ' ' ? ch : ch + mark
  return out
}

function styleRun(text: string, active: Set<string>): string {
  let out = text
  const bold = active.has('bold')
  const italic = active.has('italic')

  if (bold && italic) out = toUnicodeStyle(out, 'boldItalic')
  else if (bold) out = toUnicodeStyle(out, 'bold')
  else if (italic) out = toUnicodeStyle(out, 'italic')

  if (active.has('underline')) out = addCombining(out, UNDERLINE)
  if (active.has('strike')) out = addCombining(out, STRIKE)

  return out
}

const VARIABLE_TOKEN = /\{\{[^{}]*\}\}/g

// Markers left around a styled {{token}} so the style can be applied to the
// substituted value later. Control characters, so nothing in real content
// collides with them; any that survive are stripped before sending.
const OPEN = ''
const SEP = ''
const CLOSE = ''
const DEFERRED = /([bius]*)([\s\S]*?)/g

const FLAGS: Record<string, string> = { bold: 'b', italic: 'i', underline: 'u', strike: 's' }
const STYLES: Record<string, string> = { b: 'bold', i: 'italic', u: 'underline', s: 'strike' }

/**
 * Applies a set of active styles to one run of text. Bold and italic combine
 * into the single bold-italic alphabet rather than stacking.
 *
 * A {{token}} is not styled in place — its letters would end up spelled in
 * Mathematical Alphanumerics, renderTemplate would no longer match the name,
 * and the variable would ship unsubstituted. Instead the style is recorded
 * around it and applied to the value by applyDeferredStyles once substitution
 * has run, so bolding {{name}} bolds the name it stands for.
 */
export function applyStyles(text: string, active: Set<string>): string {
  if (!text || active.size === 0) return text

  const flags = Object.keys(FLAGS)
    .filter((style) => active.has(style))
    .map((style) => FLAGS[style])
    .join('')

  const pattern = new RegExp(VARIABLE_TOKEN.source, 'g')
  let out = ''
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    out += styleRun(text.slice(last, match.index), active) + OPEN + flags + SEP + match[0] + CLOSE
    last = match.index + match[0].length
  }

  return out + styleRun(text.slice(last), active)
}

/**
 * Styles the values that landed where styled {{tokens}} were. Run this after
 * renderTemplate, never before.
 */
export function applyDeferredStyles(text: string): string {
  if (!text.includes(OPEN)) return text

  return text
    .replace(DEFERRED, (_full, flags: string, value: string) => {
      // Still a bare token, so nothing was substituted — validateVariables
      // normally stops that reaching here, but styling it would leave the
      // name spelled in Mathematical Alphanumerics and unreadable.
      if (/^\{\{[^{}]*\}\}$/.test(value)) return value
      return styleRun(value, new Set([...flags].map((f) => STYLES[f])))
    })
    // An unbalanced marker would otherwise reach the handset as a stray
    // control character.
    .replace(/[]/g, '')
}

/** Which style an inline tag turns on. Anything else carries no plain-text equivalent. */
export function styleForTag(tag: string): string | null {
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

export const STYLE_TAG_PATTERN = /<\/?\s*(b|strong|i|em|u|ins|s|strike|del)\b[^>]*>/gi
