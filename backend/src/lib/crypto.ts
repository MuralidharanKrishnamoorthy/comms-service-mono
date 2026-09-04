import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// Reversible encryption for API key values, so a key's CREATOR can copy it again
// later (see routes/apiKeys.ts reveal). This is a deliberate security trade-off:
// unlike the one-way key_hash used for send-time auth, this path can reconstruct
// the plaintext. The two are kept entirely separate — never decrypt this for
// authentication.
//
// Master key comes from API_KEY_ENCRYPTION_KEY (any string — we derive a fixed
// 32-byte key from it via SHA-256). In production this MUST come from a secrets
// manager, not a checked-in .env.

const configured = process.env.API_KEY_ENCRYPTION_KEY
if (!configured) {
  console.warn(
    '[api-keys] API_KEY_ENCRYPTION_KEY is not set — using an insecure development ' +
      'default. Set it (ideally from a secrets manager) before deploying, and note ' +
      'that rotating it makes existing encrypted key values unrecoverable.'
  )
}
const MASTER_KEY = createHash('sha256')
  .update(configured || 'dev-insecure-api-key-encryption-key-change-me')
  .digest() // 32 bytes for AES-256

const ALGO = 'aes-256-gcm'
const VERSION = 'v1'

// Serialized form: "v1:<ivB64>:<tagB64>:<cipherB64>". The version prefix lets us
// rotate algorithms later without guessing the format.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12) // 96-bit nonce, unique per record (GCM best practice)
  const cipher = createCipheriv(ALGO, MASTER_KEY, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed encrypted secret')
  }
  const [, ivB64, tagB64, cipherB64] = parts
  const decipher = createDecipheriv(ALGO, MASTER_KEY, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(cipherB64, 'base64')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}
