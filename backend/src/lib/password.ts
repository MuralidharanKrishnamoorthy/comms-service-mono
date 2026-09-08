import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

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
