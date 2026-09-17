import { Hono, type Context } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { createRateLimiter } from '../lib/rateLimit.js'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySession,
} from '../lib/jwt.js'
import { changePasswordSchema, loginSchema, type User } from '../models/user.js'

export const authRoute = new Hono()

const isProd = process.env.NODE_ENV === 'production'
const trustProxy = process.env.TRUST_PROXY === 'true'

const MINUTE_MS = 60_000
const LOGIN_MAX_PER_EMAIL = 10
const LOGIN_MAX_PER_IP = 30
const PASSWORD_CHANGE_MAX = 10

const loginLimiter = createRateLimiter(15 * MINUTE_MS)
const passwordChangeLimiter = createRateLimiter(MINUTE_MS)

async function sessionUser(c: Context): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE)
  const claims = token ? await verifySession(token) : null
  if (!claims || !ObjectId.isValid(claims.sub)) return null

  const user = await getDb().collection<User>('users').findOne({ _id: new ObjectId(claims.sub) })
  if (!user || user.status !== 'active') return null

  return user
}

function meResponse(user: User) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.must_change_password ?? false,
  }
}

function clientIp(c: Context): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0]!.trim()

    const real = c.req.header('x-real-ip')
    if (real) return real.trim()
  }

  return getConnInfo(c).remote.address ?? 'unknown'
}

function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
}

authRoute.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Email and password are required' }, 400)
  }

  const email = parsed.data.email.toLowerCase().trim()
  const emailKey = `email:${email}`

  const releaseAttempt = loginLimiter.reserve([
    { key: emailKey, max: LOGIN_MAX_PER_EMAIL },
    { key: `ip:${clientIp(c)}`, max: LOGIN_MAX_PER_IP },
  ])
  if (!releaseAttempt) {
    return c.json({ error: 'Too many failed sign-in attempts — try again later' }, 429)
  }

  const user = await getDb().collection<User>('users').findOne({ email })
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  releaseAttempt()

  if (user.status !== 'active') {
    return c.json({ error: 'This account is disabled' }, 403)
  }

  loginLimiter.reset(emailKey)

  setSessionCookie(c, await signSession(user._id!.toString(), user.role))

  return c.json(meResponse(user))
})

authRoute.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

authRoute.get('/me', async (c) => {
  const user = await sessionUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)

  return c.json(meResponse(user))
})

authRoute.post('/me/password', async (c) => {
  const user = await sessionUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)

  const body = await c.req.json().catch(() => null)
  const parsed = changePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid password' }, 400)
  }

  const userId = user._id!.toString()
  if (!passwordChangeLimiter.reserve([{ key: userId, max: PASSWORD_CHANGE_MAX }])) {
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

  console.info(`[auth] password change: user=${userId} at=${new Date().toISOString()}`)

  return c.json({ ok: true })
})
