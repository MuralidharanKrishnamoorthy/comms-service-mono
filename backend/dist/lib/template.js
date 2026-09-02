/**
 * Template rendering engine.
 *
 * Templates store `{{variable}}` tokens (whitespace inside braces is tolerated,
 * e.g. `{{ variable }}`). Rendering substitutes each token with the matching
 * value from the caller-supplied data object.
 *
 * The rich-text email editor can bold/italic/color just the inner word of a
 * token (e.g. select only "user_name" inside "{{user_name}}"), which splits
 * the braces from the name into separate HTML text runs — e.g.
 * "{{<strong>user_name</strong>}}". The pattern below tolerates any number
 * of simple inline tags immediately around the identifier so that still
 * counts as one token; the whole match (braces, tags and all) is replaced by
 * the plain substituted value. It does not tolerate a tag landing inside the
 * identifier itself (e.g. only "user_" bolded) — that's a rarer, harder case.
 *
 * HTML content (email) is escaped by default — variable values are user/app
 * data, never trusted markup, so they must never be able to inject tags or
 * break out of the surrounding HTML. Plain text content (SMS/push) is not
 * escaped, since there is no markup to protect.
 */
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
