import { applyStyles, STYLE_TAG_PATTERN, styleForTag } from './unicodeStyle.js'

const TOKEN_PATTERN = /\{\{\s*(?:<\/?[a-zA-Z][^>]*>\s*)*([a-zA-Z0-9_]+)\s*(?:<\/?[a-zA-Z][^>]*>\s*)*\}\}/g

export class MissingVariablesError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(`Missing required template variables: ${missing.join(', ')}`)
    this.name = 'MissingVariablesError'
    this.missing = missing
  }
}

/**
 * Throws MissingVariablesError if any variable the template declares as
 * required is absent, null, or undefined in the supplied data. Must run
 * before rendering — rendering assumes this has already passed.
 */
export function validateVariables(required: string[], data: Record<string, unknown>): void {
  const missing = required.filter((key) => data[key] === undefined || data[key] === null)
  if (missing.length > 0) {
    throw new MissingVariablesError(missing)
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface RenderOptions {
  /** Escape substituted values as HTML. Use for email subject/body. Default: false. */
  escapeHtml?: boolean
}

/**
 * Substitutes every {{variable}} token in `text` with its value from `data`.
 * Call validateVariables() first — this function does not throw on a missing
 * key, it leaves the original token in place, since that should never happen
 * once validation has already run.
 */
export function renderTemplate(text: string, data: Record<string, unknown>, options: RenderOptions = {}): string {
  return text.replace(TOKEN_PATTERN, (fullMatch, key: string) => {
    const value = data[key]
    if (value === undefined || value === null) {
      return fullMatch
    }
    const stringValue = String(value)
    return options.escapeHtml ? escapeHtml(stringValue) : stringValue
  })
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    // &amp; last, or "&amp;lt;" would decode twice into a "<".
    .replace(/&amp;/gi, '&')
}

export interface PlainTextOptions {
  /**
   * Re-express bold/italic/underline/strikethrough as Unicode characters that
   * survive a plain-text channel. See lib/unicodeStyle.ts for the trade-offs.
   * Off means emphasis is simply dropped.
   */
  styleWithUnicode?: boolean
}

/**
 * Flattens authored HTML down to what SMS and push actually carry.
 *
 * Those channels have no markup in their wire format, so a <b> delivered as-is
 * would arrive as three literal characters. Structure with a plain-text
 * equivalent is kept (line breaks, list bullets). Emphasis is either converted
 * to Unicode styled characters or dropped, per `styleWithUnicode`. Colour,
 * highlight and images have no equivalent and are always dropped.
 *
 * Runs BEFORE variable substitution, so a value containing "<" is never
 * mistaken for a tag. Mirrored in frontend/src/util.ts for the live preview.
 */
export function htmlToPlainText(html: string, options: PlainTextOptions = {}): string {
  // A body authored before the editor offered formatting, or typed in the
  // plain view, has nothing to strip.
  if (!/[<&]/.test(html)) return html

  // Block structure first, while the tags are still intact.
  const blocks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    // Not </li> — the opening <li> already started that line.
    .replace(/<\s*\/\s*(p|div|h[1-6]|ul|ol|tr)\s*>/gi, '\n')

  // Drop everything that carries no plain-text meaning, keeping the inline
  // emphasis tags so the styling pass below can still see them.
  const kept = blocks.replace(/<(?!\/?\s*(?:b|strong|i|em|u|ins|s|strike|del)\b)[^>]+>/gi, '')

  const styled = options.styleWithUnicode
    ? styleInline(kept)
    : decodeEntities(kept.replace(STYLE_TAG_PATTERN, ''))

  return styled
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Walks the remaining inline tags, tracking which styles are open, and
 * converts each run of text with the styles active over it. A stack rather
 * than nested replacement, so <b>a<i>b</i></b> yields bold "a" followed by
 * bold-italic "b" instead of trying to style already-styled characters.
 */
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

// A template author who never touches formatting still gets a properly laid
// out email rather than raw unstyled paragraphs. Only applied to body
// fragments — a template that's already a full HTML document (built by hand
// with its own <html>/<!DOCTYPE>) is left untouched, since it's already
// designed. Runs after variable substitution, on both the real send path and
// the dashboard's live preview, so what you preview is exactly what ships.
const FULL_DOCUMENT_PATTERN = /<!doctype html|<html[\s>]/i

export function wrapEmailHtml(bodyHtml: string): string {
  if (FULL_DOCUMENT_PATTERN.test(bodyHtml)) return bodyHtml
  return `<div style="background:#f5f6f4;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;color:#15181d;font-size:15px;line-height:1.6;">
    ${bodyHtml}
  </div>
</div>`
}
