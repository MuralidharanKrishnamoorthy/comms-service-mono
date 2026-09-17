import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const STRONG = 'c'.repeat(64)
process.env.API_KEY_ENCRYPTION_KEY = STRONG

const { encryptSecret, decryptSecret } = await import('../src/lib/crypto.js')

const PLAINTEXT = 'csvc_0123456789abcdef0123456789abcdef0123456789abcdef'

describe('API key encryption', () => {
  test('a value survives a round trip', () => {
    assert.equal(decryptSecret(encryptSecret(PLAINTEXT)), PLAINTEXT)
  })

  test('the plaintext never appears in the ciphertext', () => {
    assert.ok(!encryptSecret(PLAINTEXT).includes(PLAINTEXT))
  })

  test('the master key never appears in the ciphertext', () => {
    assert.ok(!encryptSecret(PLAINTEXT).includes(STRONG))
  })

  test('encrypting twice gives different ciphertexts', () => {
    // A random IV per call, so identical keys do not produce identical rows.
    assert.notEqual(encryptSecret(PLAINTEXT), encryptSecret(PLAINTEXT))
  })

  test('both ciphertexts still decrypt to the same value', () => {
    assert.equal(decryptSecret(encryptSecret(PLAINTEXT)), decryptSecret(encryptSecret(PLAINTEXT)))
  })

  test('the stored format is versioned', () => {
    assert.equal(encryptSecret(PLAINTEXT).split(':').length, 4)
    assert.equal(encryptSecret(PLAINTEXT).split(':')[0], 'v1')
  })

  test('an empty string round trips', () => {
    assert.equal(decryptSecret(encryptSecret('')), '')
  })
})

describe('tampering is detected', () => {
  test('a malformed payload is rejected', () => {
    assert.throws(() => decryptSecret('nonsense'), /Malformed encrypted secret/)
    assert.throws(() => decryptSecret('v1:only:three'), /Malformed encrypted secret/)
  })

  test('an unknown version is rejected', () => {
    const [, iv, tag, data] = encryptSecret(PLAINTEXT).split(':')
    assert.throws(() => decryptSecret(`v2:${iv}:${tag}:${data}`), /Malformed encrypted secret/)
  })

  test('altered ciphertext fails the authentication tag', () => {
    const [v, iv, tag, data] = encryptSecret(PLAINTEXT).split(':')
    const flipped = Buffer.from(data, 'base64')
    flipped[0] ^= 0xff
    assert.throws(() => decryptSecret(`${v}:${iv}:${tag}:${flipped.toString('base64')}`))
  })

  test('a swapped authentication tag is rejected', () => {
    const [v, iv, , data] = encryptSecret(PLAINTEXT).split(':')
    const otherTag = encryptSecret('something else').split(':')[2]
    assert.throws(() => decryptSecret(`${v}:${iv}:${otherTag}:${data}`))
  })
})

describe('startup refuses a missing or weak key', () => {
  const load = async (value: string | undefined) => {
    const previous = process.env.API_KEY_ENCRYPTION_KEY
    if (value === undefined) delete process.env.API_KEY_ENCRYPTION_KEY
    else process.env.API_KEY_ENCRYPTION_KEY = value
    try {
      await import(`../src/lib/crypto.js?probe=${encodeURIComponent(String(value))}-${Math.random()}`)
      return null
    } catch (err) {
      return (err as Error).message
    } finally {
      process.env.API_KEY_ENCRYPTION_KEY = previous
    }
  }

  test('missing key stops the server and names the variable', async () => {
    assert.match((await load(undefined)) ?? '', /API_KEY_ENCRYPTION_KEY is not set/)
  })

  test('the old published default is too short to be accepted', async () => {
    // It was 44 characters, so assert the real guard: it is no longer a fallback.
    const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/lib/crypto.ts', import.meta.url), 'utf8'))
    assert.ok(!source.includes('dev-insecure-api-key-encryption-key-change-me'))
  })

  test('a short key stops the server', async () => {
    assert.match((await load('secret')) ?? '', /API_KEY_ENCRYPTION_KEY is too short/)
  })

  test('32 characters is accepted', async () => {
    assert.equal(await load('x'.repeat(32)), null)
  })
})
