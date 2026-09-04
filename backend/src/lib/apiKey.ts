import { randomBytes, createHash } from 'node:crypto'

/**
 * API keys look like: csvc_<48 hex chars>
 * Only the SHA-256 hash is ever stored — the plaintext is returned once, at creation.
 */

export interface GeneratedApiKey {
  plaintext: string
  hash: string
}

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(24).toString('hex')
  const plaintext = `csvc_${secret}`
  const hash = hashApiKey(plaintext)
  return { plaintext, hash }
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

// The leading, non-secret portion safe to show to anyone who can list keys
// (e.g. "csvc_1a2b3c4d5e"). Never enough to authenticate with.
export function keyPrefix(plaintext: string): string {
  return plaintext.slice(0, 15)
}
