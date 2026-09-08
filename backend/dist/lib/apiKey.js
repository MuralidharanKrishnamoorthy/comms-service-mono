import { randomBytes, createHash } from 'node:crypto';
export function generateApiKey() {
    const secret = randomBytes(24).toString('hex');
    const plaintext = `csvc_${secret}`;
    const hash = hashApiKey(plaintext);
    return { plaintext, hash };
}
export function hashApiKey(plaintext) {
    return createHash('sha256').update(plaintext).digest('hex');
}
// The leading, non-secret portion safe to show to anyone who can list keys
// (e.g. "csvc_1a2b3c4d5e"). Never enough to authenticate with.
export function keyPrefix(plaintext) {
    return plaintext.slice(0, 15);
}
