import { sign, verify } from 'hono/jwt'

// Dashboard session tokens. This is completely separate from the
// "Authorization: Bearer <api_key>" scheme used by consuming apps on
// /v1/notifications/send — different secret, different transport (httpOnly
// cookie), no shared code path.

const configured = process.env.DASH_JWT_SECRET
if (!configured) {
  console.warn(
    '[auth] DASH_JWT_SECRET is not set — using an insecure development default. ' +
      'Set DASH_JWT_SECRET in backend/.env before deploying.'
  )
}
const JWT_SECRET = configured || 'dev-insecure-dashboard-secret-change-me'

// 8-hour sessions.
const SESSION_TTL_SECONDS = 8 * 60 * 60

export interface SessionClaims {
  sub: string // user _id
  role: string
  iat: number
  exp: number
}

export async function signSession(userId: string, role: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return sign(
    { sub: userId, role, iat: now, exp: now + SESSION_TTL_SECONDS },
    JWT_SECRET,
    'HS256'
  )
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    return (await verify(token, JWT_SECRET, 'HS256')) as unknown as SessionClaims
  } catch {
    // Expired, malformed, or bad signature — all treated as "not authenticated".
    return null
  }
}

export const SESSION_COOKIE = 'dash_session'
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS
