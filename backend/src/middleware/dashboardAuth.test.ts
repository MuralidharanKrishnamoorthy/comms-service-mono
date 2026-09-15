import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ObjectId } from 'mongodb'
import type { AuthUser } from './dashboardAuth.js'
import type { Role } from '../models/user.js'

// dashboardAuth.ts transitively imports db.ts, which throws at import time when
// MONGODB_URI is unset (the test runner doesn't load .env). requireAdmin never
// touches the database, so we give db.ts harmless values and load the module
// dynamically — no connection is ever opened.
process.env.MONGODB_URI ??= 'mongodb://localhost:27017'
process.env.DB_NAME ??= 'test'
const { requireAdmin } = await import('./dashboardAuth.js')

// A minimal stand-in for Hono's context: just enough for requireAdmin, which
// only reads c.get('user') and either short-circuits with c.json(...) or calls
// next(). Lets us exercise the guard without a server or database.
function runGuard(role: Role | null) {
  const user: AuthUser | null =
    role === null
      ? null
      : {
          _id: new ObjectId(),
          email: 'u@local.dev',
          name: 'U',
          role,
          status: 'active',
          project_ids: [],
        }

  let nextCalled = false
  const responses: Array<{ body: unknown; status: number }> = []
  const c = {
    get: (key: string) => (key === 'user' ? user : undefined),
    json: (body: unknown, status: number) => {
      responses.push({ body, status })
      return { body, status }
    },
  }
  const next = async () => {
    nextCalled = true
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { result: (requireAdmin as any)(c, next), nextCalled: () => nextCalled, responses }
}

test('requireAdmin rejects a developer with 403 and does not call next', async () => {
  const { result, nextCalled, responses } = runGuard('developer')
  await result
  assert.equal(nextCalled(), false)
  assert.equal(responses[0]?.status, 403)
})

test('requireAdmin rejects a ba and a tester with 403', async () => {
  for (const role of ['ba', 'tester'] as const) {
    const { nextCalled, responses } = runGuard(role)
    assert.equal(nextCalled(), false)
    assert.equal(responses[0]?.status, 403)
  }
})

test('requireAdmin rejects an unauthenticated request with 403', async () => {
  const { nextCalled, responses } = runGuard(null)
  assert.equal(nextCalled(), false)
  assert.equal(responses[0]?.status, 403)
})

test('requireAdmin lets an admin through to next()', async () => {
  const { result, nextCalled, responses } = runGuard('admin')
  await result
  assert.equal(nextCalled(), true)
  assert.equal(responses.length, 0)
})
