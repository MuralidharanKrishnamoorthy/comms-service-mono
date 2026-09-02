import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { verifyPassword } from '../lib/password.js'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySession,
} from '../lib/jwt.js'
import { loginSchema, type User } from '../models/user.js'

// Mounted at /auth — these routes are PUBLIC (no dashboardAuth). Login must be
// reachable without a session; /me reads and verifies the cookie itself.
export const authRoute = new Hono()

const isProd = process.env.NODE_ENV === 'production'

function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd, // over plain http on localhost, Secure would drop the cookie
    sameSite: 'Lax', // localhost:5173 -> localhost:3000 is same-site, so Lax is sent
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
}

// POST /auth/login  { email, password }
authRoute.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Email and password are required' }, 400)
  }

  const db = getDb()
  const user = await db
    .collection<User>('users')
    .findOne({ email: parsed.data.email.toLowerCase().trim() })

  // Same response for unknown email and wrong password — don't leak which failed.
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }
  if (user.status !== 'active') {
    return c.json({ error: 'This account is disabled' }, 403)
  }

  const token = await signSession(user._id!.toString(), user.role)
  setSessionCookie(c, token)

  return c.json({ id: user._id, email: user.email, name: user.name, role: user.role })
})

// POST /auth/logout
authRoute.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

// GET /auth/me → the logged-in user, or 401.
authRoute.get('/me', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  const claims = token ? await verifySession(token) : null
  if (!claims || !ObjectId.isValid(claims.sub)) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const user = await getDb()
    .collection<User>('users')
    .findOne({ _id: new ObjectId(claims.sub) })
  if (!user || user.status !== 'active') {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  return c.json({ id: user._id, email: user.email, name: user.name, role: user.role })
})
