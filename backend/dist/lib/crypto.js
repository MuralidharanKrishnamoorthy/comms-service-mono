import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { requireSecret } from './env.js';
const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;
const MASTER_KEY = createHash('sha256')
    .update(requireSecret('API_KEY_ENCRYPTION_KEY'))
    .digest();
export function encryptSecret(plaintext) {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, MASTER_KEY, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
        VERSION,
        iv.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        ciphertext.toString('base64'),
    ].join(':');
}
export function decryptSecret(payload) {
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new Error('Malformed encrypted secret');
    }
    const [, iv, tag, ciphertext] = parts;
    const decipher = createDecipheriv(ALGORITHM, MASTER_KEY, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
    ]).toString('utf8');
}
