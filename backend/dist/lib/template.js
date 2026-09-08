const TOKEN_PATTERN = /\{\{\s*(?:<\/?[a-zA-Z][^>]*>\s*)*([a-zA-Z0-9_]+)\s*(?:<\/?[a-zA-Z][^>]*>\s*)*\}\}/g;
export class MissingVariablesError extends Error {
    missing;
    constructor(missing) {
        super(`Missing required template variables: ${missing.join(', ')}`);
        this.name = 'MissingVariablesError';
        this.missing = missing;
    }
}
/**
 * Throws MissingVariablesError if any variable the template declares as
 * required is absent, null, or undefined in the supplied data. Must run
 * before rendering — rendering assumes this has already passed.
 */
export function validateVariables(required, data) {
    const missing = required.filter((key) => data[key] === undefined || data[key] === null);
    if (missing.length > 0) {
        throw new MissingVariablesError(missing);
    }
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
/**
 * Substitutes every {{variable}} token in `text` with its value from `data`.
 * Call validateVariables() first — this function does not throw on a missing
 * key, it leaves the original token in place, since that should never happen
 * once validation has already run.
 */
export function renderTemplate(text, data, options = {}) {
    return text.replace(TOKEN_PATTERN, (fullMatch, key) => {
        const value = data[key];
        if (value === undefined || value === null) {
            return fullMatch;
        }
        const stringValue = String(value);
        return options.escapeHtml ? escapeHtml(stringValue) : stringValue;
    });
}
// A template author who never touches formatting still gets a properly laid
// out email rather than raw unstyled paragraphs. Only applied to body
// fragments — a template that's already a full HTML document (built by hand
// with its own <html>/<!DOCTYPE>) is left untouched, since it's already
// designed. Runs after variable substitution, on both the real send path and
// the dashboard's live preview, so what you preview is exactly what ships.
const FULL_DOCUMENT_PATTERN = /<!doctype html|<html[\s>]/i;
export function wrapEmailHtml(bodyHtml) {
    if (FULL_DOCUMENT_PATTERN.test(bodyHtml))
        return bodyHtml;
    return `<div style="background:#f5f6f4;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;color:#15181d;font-size:15px;line-height:1.6;">
    ${bodyHtml}
  </div>
</div>`;
}
