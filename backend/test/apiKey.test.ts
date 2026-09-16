import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { generateApiKey, hashApiKey, keyPrefix } from '../src/lib/apiKey.js'

describe('API key generation', () => {
  test('a key has the csvc_ prefix and 48 hex characters', () => {
    assert.match(generateApiKey().plaintext, /^csvc_[0-9a-f]{48}$/)
  })

  test('every key is different', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateApiKey().plaintext))
    assert.equal(seen.size, 200)
  })

  test('the returned hash matches the returned plaintext', () => {
    const { plaintext, hash } = generateApiKey()
    assert.equal(hash, hashApiKey(plaintext))
  })
})

describe('API key hashing', () => {
  test('the hash is stable for the same input', () => {
    const { plaintext } = generateApiKey()
    assert.equal(hashApiKey(plaintext), hashApiKey(plaintext))
  })

  test('the hash is 64 hex characters', () => {
    assert.match(hashApiKey(generateApiKey().plaintext), /^[0-9a-f]{64}$/)
  })

  test('different keys hash differently', () => {
    assert.notEqual(hashApiKey(generateApiKey().plaintext), hashApiKey(generateApiKey().plaintext))
  })

  test('the plaintext is not recoverable from the hash', () => {
    const { plaintext, hash } = generateApiKey()
    assert.ok(!hash.includes(plaintext.replace('csvc_', '')))
  })

  test('a one-character change gives a completely different hash', () => {
    const { plaintext } = generateApiKey()
    const altered = plaintext.slice(0, -1) + (plaintext.endsWith('a') ? 'b' : 'a')
    assert.notEqual(hashApiKey(plaintext), hashApiKey(altered))
  })
})

describe('key prefix', () => {
  test('the prefix is the first 15 characters', () => {
    const { plaintext } = generateApiKey()
    assert.equal(keyPrefix(plaintext), plaintext.slice(0, 15))
    assert.equal(keyPrefix(plaintext).length, 15)
  })

  test('the prefix is far too short to authenticate with', () => {
    const { plaintext } = generateApiKey()
    // 15 chars = "csvc_" + 10 hex, leaving 38 hex characters secret.
    assert.equal(plaintext.length - keyPrefix(plaintext).length, 38)
    assert.notEqual(hashApiKey(keyPrefix(plaintext)), hashApiKey(plaintext))
  })
})
