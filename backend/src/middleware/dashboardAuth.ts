import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { SESSION_COOKIE, verifySession } from '../lib/jwt.js'
import type { Role, User } from '../models/user.js'

// The authenticated dashboard user attached to the request context. Role is
// re-read from the DB on every request — we never trust the (possibly stale)
// role claim baked into the JWT for authorization decisions.
export interface AuthUser {
  _id: ObjectId
  email: string
  name: string
  role: Role
  status: 'active' | 'disabled'
  project_ids: ObjectId[]
}

export type AuthEnv = { Variables: { user: AuthUser } }

/**
 * Verifies the dash_session cookie, loads the user, and attaches it to the
 * context as c.get('user'). 401 if the session is missing/invalid or the
 * account is disabled. Mount on every dashboard route (NOT on /auth/login or
 * the api-key-authenticated /v1/* routes).
 */
export const dashboardAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  const claims = token ? await verifySession(token) : null
  if (!claims) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  if (!ObjectId.isValid(claims.sub)) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const user = await getDb()
    .collection<User>('users')
    .findOne({ _id: new ObjectId(claims.sub) })

  if (!user || user.status !== 'active') {
    return c.json({ error: 'Account is disabled or no longer exists' }, 401)
  }

  c.set('user', {
    _id: user._id!,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    project_ids: user.project_ids ?? [],
  })
  await next()
})

/** Requires the authenticated user to be an admin. Mount AFTER dashboardAuth. */
export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const user = c.get('user')
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403)
  }
  await next()
})
