import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
const configured = process.env.API_KEY_ENCRYPTION_KEY;
if (!configured) {
    console.warn('[api-keys] API_KEY_ENCRYPTION_KEY is not set — using an insecure development ' +
        'default. Set it (ideally from a secrets manager) before deploying, and note ' +
        'that rotating it makes existing encrypted key values unrecoverable.');
}
const MASTER_KEY = createHash('sha256')
    .update(configured || 'dev-insecure-api-key-encryption-key-change-me')
    .digest();
const ALGO = 'aes-256-gcm';
const VERSION = 'v1';
export function encryptSecret(plaintext) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, MASTER_KEY, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}
export function decryptSecret(payload) {
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new Error('Malformed encrypted secret');
    }
    const [, ivB64, tagB64, cipherB64] = parts;
    const decipher = createDecipheriv(ALGO, MASTER_KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(cipherB64, 'base64')),
        decipher.final(),
    ]);
    return plaintext.toString('utf8');
}
