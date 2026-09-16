import { sign, verify } from 'hono/jwt'
import { z } from 'zod'
import { requireSecret } from './env.js'

const JWT_SECRET = requireSecret('DASH_JWT_SECRET')

const SESSION_TTL_SECONDS = 8 * 60 * 60

const sessionClaimsSchema = z.object({
  sub: z.string().min(1),
  role: z.string().min(1),
  iat: z.number(),
  exp: z.number(),
})

export type SessionClaims = z.infer<typeof sessionClaimsSchema>

export const SESSION_COOKIE = 'dash_session'
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS

export async function signSession(userId: string, role: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000)

  return sign(
    { sub: userId, role, iat: issuedAt, exp: issuedAt + SESSION_TTL_SECONDS },
    JWT_SECRET,
    'HS256'
  )
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const claims = sessionClaimsSchema.safeParse(await verify(token, JWT_SECRET, 'HS256'))
    return claims.success ? claims.data : null
  } catch {
    return null
  }
}
