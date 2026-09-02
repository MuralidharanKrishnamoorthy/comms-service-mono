import { randomBytes, createHash } from 'node:crypto';
export function generateApiKey() {
    const secret = randomBytes(24).toString('hex');
    const plaintext = `csvc_${secret}`;
    const prefix = plaintext.slice(0, 13); // "csvc_" + first 8 hex chars
    const hash = hashApiKey(plaintext);
    return { plaintext, prefix, hash };
}
export function hashApiKey(plaintext) {
    return createHash('sha256').update(plaintext).digest('hex');
}
