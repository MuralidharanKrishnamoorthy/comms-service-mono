import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySession,
} from '../lib/jwt.js'
import { changePasswordSchema, loginSchema, type User } from '../models/user.js'

// Mounted at /auth — these routes are PUBLIC (no dashboardAuth). Login must be
// reachable without a session; /me reads and verifies the cookie itself.
export const authRoute = new Hono()

const isProd = process.env.NODE_ENV === 'production'

// Resolve the logged-in user from the session cookie, or null. Shared by /me
// and /me/password so both authenticate identically (these routes are mounted
// outside dashboardAuth).
async function sessionUser(c: Context): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE)
  const claims = token ? await verifySession(token) : null
  if (!claims || !ObjectId.isValid(claims.sub)) return null
  const user = await getDb().collection<User>('users').findOne({ _id: new ObjectId(claims.sub) })
  if (!user || user.status !== 'active') return null
  return user
}

// Public view of a user for auth responses. Exposes mustChangePassword (camelCase
// for the client) so the Profile page can show the temporary-password notice.
function meResponse(user: User) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.must_change_password ?? false,
  }
}

// Lightweight in-memory throttle for password changes, mirroring the reveal
// limiter in routes/apiKeys.ts (the app's one existing rate-limit pattern —
// login itself is not currently throttled).
const pwHits = new Map<string, number[]>()
const PW_WINDOW_MS = 60_000
const PW_MAX = 10
function passwordChangeAllowed(userId: string): boolean {
  const now = Date.now()
  const hits = (pwHits.get(userId) ?? []).filter((t) => now - t < PW_WINDOW_MS)
  if (hits.length >= PW_MAX) {
    pwHits.set(userId, hits)
    return false
  }
  hits.push(now)
  pwHits.set(userId, hits)
  return true
}

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

  return c.json(meResponse(user))
})

// POST /auth/logout
authRoute.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

// GET /auth/me → the logged-in user (incl. mustChangePassword), or 401.
authRoute.get('/me', async (c) => {
  const user = await sessionUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  return c.json(meResponse(user))
})

// POST /auth/me/password — self-service password change for ANY authenticated
// user (admin/developer/ba/tester), for their OWN account only. The target is
// always the session user; no user id is accepted from the body. No
// currentPassword is required (this is reached from the Profile page, not a
// re-auth flow).
authRoute.post('/me/password', async (c) => {
  const user = await sessionUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)

  const body = await c.req.json().catch(() => null)
  const parsed = changePasswordSchema.safeParse(body)
  if (!parsed.success) {
    // Surface the first rule violation so the frontend can show it inline, and
    // keep it a 400 (validation) distinct from 401 (auth) / 500 (server).
    const message = parsed.error.issues[0]?.message ?? 'Invalid password'
    return c.json({ error: message }, 400)
  }

  if (!passwordChangeAllowed(user._id!.toString())) {
    return c.json({ error: 'Too many password changes — try again shortly' }, 429)
  }

  await getDb()
    .collection<User>('users')
    .updateOne(
      { _id: user._id },
      {
        $set: {
          password_hash: hashPassword(parsed.data.newPassword),
          must_change_password: false,
          updated_at: new Date(),
        },
      }
    )

  // Audit trail, following the console-log pattern used elsewhere (see the
  // reveal log in routes/apiKeys.ts).
  console.info(
    `[auth] password change: user=${user._id!.toString()} at=${new Date().toISOString()}`
  )

  return c.json({ ok: true })
})
