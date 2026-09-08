import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession, } from '../lib/jwt.js';
import { changePasswordSchema, loginSchema } from '../models/user.js';
export const authRoute = new Hono();
const isProd = process.env.NODE_ENV === 'production';
async function sessionUser(c) {
    const token = getCookie(c, SESSION_COOKIE);
    const claims = token ? await verifySession(token) : null;
    if (!claims || !ObjectId.isValid(claims.sub))
        return null;
    const user = await getDb().collection('users').findOne({ _id: new ObjectId(claims.sub) });
    if (!user || user.status !== 'active')
        return null;
    return user;
}
function meResponse(user) {
    return {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.must_change_password ?? false,
    };
}
const pwHits = new Map();
const PW_WINDOW_MS = 60_000;
const PW_MAX = 10;
function passwordChangeAllowed(userId) {
    const now = Date.now();
    const hits = (pwHits.get(userId) ?? []).filter((t) => now - t < PW_WINDOW_MS);
    if (hits.length >= PW_MAX) {
        pwHits.set(userId, hits);
        return false;
    }
    hits.push(now);
    pwHits.set(userId, hits);
    return true;
}
function setSessionCookie(c, token) {
    setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'Lax',
        path: '/',
        maxAge: SESSION_MAX_AGE,
    });
}
authRoute.post('/login', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Email and password are required' }, 400);
    }
    const db = getDb();
    const user = await db
        .collection('users')
        .findOne({ email: parsed.data.email.toLowerCase().trim() });
    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
        return c.json({ error: 'Invalid email or password' }, 401);
    }
    if (user.status !== 'active') {
        return c.json({ error: 'This account is disabled' }, 403);
    }
    const token = await signSession(user._id.toString(), user.role);
    setSessionCookie(c, token);
    return c.json(meResponse(user));
});
authRoute.post('/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
});
authRoute.get('/me', async (c) => {
    const user = await sessionUser(c);
    if (!user)
        return c.json({ error: 'Not authenticated' }, 401);
    return c.json(meResponse(user));
});
authRoute.post('/me/password', async (c) => {
    const user = await sessionUser(c);
    if (!user)
        return c.json({ error: 'Not authenticated' }, 401);
    const body = await c.req.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? 'Invalid password';
        return c.json({ error: message }, 400);
    }
    if (!passwordChangeAllowed(user._id.toString())) {
        return c.json({ error: 'Too many password changes — try again shortly' }, 429);
    }
    await getDb()
        .collection('users')
        .updateOne({ _id: user._id }, {
        $set: {
            password_hash: hashPassword(parsed.data.newPassword),
            must_change_password: false,
            updated_at: new Date(),
        },
    });
    console.info(`[auth] password change: user=${user._id.toString()} at=${new Date().toISOString()}`);
    return c.json({ ok: true });
});
