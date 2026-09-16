import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const STRONG = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

process.env.DASH_JWT_SECRET = STRONG

const { signSession, verifySession, SESSION_COOKIE, SESSION_MAX_AGE } = await import('../src/lib/jwt.js')
const { sign } = await import('hono/jwt')

const USER_ID = '6aa9342b915bf3c25fb89135'
const nowSeconds = () => Math.floor(Date.now() / 1000)

describe('session tokens', () => {
  test('a signed session verifies and carries the user id', async () => {
    const claims = await verifySession(await signSession(USER_ID, 'developer'))
    assert.equal(claims?.sub, USER_ID)
    assert.equal(claims?.role, 'developer')
  })

  test('the session lasts 8 hours', async () => {
    const claims = await verifySession(await signSession(USER_ID, 'admin'))
    assert.equal(claims!.exp - claims!.iat, 8 * 60 * 60)
    assert.equal(SESSION_MAX_AGE, 8 * 60 * 60)
  })

  test('the cookie name is stable', () => {
    assert.equal(SESSION_COOKIE, 'dash_session')
  })

  test('the secret never appears in the token', async () => {
    assert.ok(!(await signSession(USER_ID, 'admin')).includes(STRONG))
  })
})

describe('forged and malformed tokens are rejected', () => {
  test('garbage is not a token', async () => {
    assert.equal(await verifySession('not-a-jwt'), null)
    assert.equal(await verifySession(''), null)
  })

  test('a token signed with a different secret is refused', async () => {
    const forged = await sign({ sub: USER_ID, role: 'admin', iat: nowSeconds(), exp: nowSeconds() + 3600 }, OTHER, 'HS256')
    assert.equal(await verifySession(forged), null)
  })

  test('the old published default secret is refused', async () => {
    const forged = await sign(
      { sub: USER_ID, role: 'admin', iat: nowSeconds(), exp: nowSeconds() + 3600 },
      'dev-insecure-dashboard-secret-change-me',
      'HS256'
    )
    assert.equal(await verifySession(forged), null)
  })

  test('an alg=none token is refused', async () => {
    const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const token = `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub: USER_ID, role: 'admin', iat: nowSeconds(), exp: nowSeconds() + 3600 })}.`
    assert.equal(await verifySession(token), null)
  })

  test('an expired token is refused', async () => {
    const expired = await sign({ sub: USER_ID, role: 'admin', iat: nowSeconds() - 7200, exp: nowSeconds() - 3600 }, STRONG, 'HS256')
    assert.equal(await verifySession(expired), null)
  })

  test('a tampered payload is refused', async () => {
    const [header, , signature] = (await signSession(USER_ID, 'tester')).split('.')
    const swapped = Buffer.from(JSON.stringify({ sub: USER_ID, role: 'admin', iat: nowSeconds(), exp: nowSeconds() + 3600 })).toString('base64url')
    assert.equal(await verifySession(`${header}.${swapped}.${signature}`), null)
  })
})

describe('claims are validated, not merely cast', () => {
  const badClaims: Array<[string, Record<string, unknown>]> = [
    ['sub missing', { role: 'admin' }],
    ['sub empty', { sub: '', role: 'admin' }],
    ['sub numeric', { sub: 12345, role: 'admin' }],
    ['sub an object', { sub: { $ne: null }, role: 'admin' }],
    ['sub an array', { sub: [USER_ID], role: 'admin' }],
    ['role missing', { sub: USER_ID }],
    ['role empty', { sub: USER_ID, role: '' }],
    ['role numeric', { sub: USER_ID, role: 7 }],
  ]

  for (const [name, partial] of badClaims) {
    test(`rejects a validly signed token with ${name}`, async () => {
      const token = await sign({ ...partial, iat: nowSeconds(), exp: nowSeconds() + 3600 }, STRONG, 'HS256')
      assert.equal(await verifySession(token), null)
    })
  }
})

describe('startup refuses a missing or weak secret', () => {
  const load = async (value: string | undefined) => {
    const previous = process.env.DASH_JWT_SECRET
    if (value === undefined) delete process.env.DASH_JWT_SECRET
    else process.env.DASH_JWT_SECRET = value
    try {
      // A distinct query string defeats the module cache so the guard re-runs.
      await import(`../src/lib/jwt.js?probe=${encodeURIComponent(String(value))}-${Math.random()}`)
      return null
    } catch (err) {
      return (err as Error).message
    } finally {
      process.env.DASH_JWT_SECRET = previous
    }
  }

  test('missing secret stops the server and names the variable', async () => {
    assert.match((await load(undefined)) ?? '', /DASH_JWT_SECRET is not set/)
  })

  test('a short secret stops the server', async () => {
    assert.match((await load('secret')) ?? '', /DASH_JWT_SECRET is too short/)
  })

  test('31 characters is still too short', async () => {
    assert.match((await load('x'.repeat(31))) ?? '', /too short/)
  })

  test('32 characters is accepted', async () => {
    assert.equal(await load('x'.repeat(32)), null)
  })
})
