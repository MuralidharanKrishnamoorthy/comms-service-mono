import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// Password hashing using Node's built-in scrypt — no external dependency.
// Stored format: "scrypt$<saltHex>$<hashHex>". password_hash is never returned
// by any API; this module is the only place that reads or writes it.

const KEYLEN = 64

export function hashPassword(plaintext: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(plaintext, salt, KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(plaintext: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(plaintext, Buffer.from(saltHex, 'hex'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
