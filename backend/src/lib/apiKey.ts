import { randomBytes, createHash } from 'node:crypto'

/**
 * API keys look like: csvc_<48 hex chars>
 * Only the SHA-256 hash is ever stored — the plaintext is returned once, at creation.
 * The prefix (first part) is stored alongside the hash to allow fast lookup without
 * hashing every stored key on every request.
 */

export interface GeneratedApiKey {
  plaintext: string
  prefix: string
  hash: string
}

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(24).toString('hex')
  const plaintext = `csvc_${secret}`
  const prefix = plaintext.slice(0, 13) // "csvc_" + first 8 hex chars
  const hash = hashApiKey(plaintext)
  return { plaintext, prefix, hash }
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}
