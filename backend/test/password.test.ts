import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword } from '../src/lib/password.js'

const PASSWORD = 'Correct12345'

describe('password hashing', () => {
  test('the right password verifies', () => {
    assert.equal(verifyPassword(PASSWORD, hashPassword(PASSWORD)), true)
  })

  test('the wrong password does not', () => {
    assert.equal(verifyPassword('Wrong1234567', hashPassword(PASSWORD)), false)
  })

  test('a one-character difference does not', () => {
    assert.equal(verifyPassword('Correct12346', hashPassword(PASSWORD)), false)
  })

  test('case matters', () => {
    assert.equal(verifyPassword('correct12345', hashPassword(PASSWORD)), false)
  })

  test('the plaintext is never stored in the hash', () => {
    assert.ok(!hashPassword(PASSWORD).includes(PASSWORD))
  })

  test('the same password hashes differently every time', () => {
    // A random salt per call, so two users with the same password do not share a hash.
    assert.notEqual(hashPassword(PASSWORD), hashPassword(PASSWORD))
  })

  test('both hashes still verify', () => {
    assert.equal(verifyPassword(PASSWORD, hashPassword(PASSWORD)), true)
    assert.equal(verifyPassword(PASSWORD, hashPassword(PASSWORD)), true)
  })

  test('unicode and long passwords round trip', () => {
    for (const p of ['pÄsswörd12345', '🔐secure12345', 'x'.repeat(200) + '1']) {
      assert.equal(verifyPassword(p, hashPassword(p)), true, p.slice(0, 12))
    }
  })
})

describe('malformed stored hashes are rejected, not crashed on', () => {
  for (const [name, stored] of [
    ['empty', ''],
    ['not a hash', 'plaintext'],
    ['unknown scheme', 'md5$abc$def'],
    ['missing parts', 'scrypt$only-one-part'],
  ] as const) {
    test(`a ${name} hash returns false`, () => {
      assert.equal(verifyPassword(PASSWORD, stored), false)
    })
  }
})
