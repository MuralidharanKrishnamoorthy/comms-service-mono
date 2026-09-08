import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { SESSION_COOKIE, verifySession } from '../lib/jwt.js';
export const dashboardAuth = createMiddleware(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const claims = token ? await verifySession(token) : null;
    if (!claims) {
        return c.json({ error: 'Not authenticated' }, 401);
    }
    if (!ObjectId.isValid(claims.sub)) {
        return c.json({ error: 'Not authenticated' }, 401);
    }
    const user = await getDb()
        .collection('users')
        .findOne({ _id: new ObjectId(claims.sub) });
    if (!user || user.status !== 'active') {
        return c.json({ error: 'Account is disabled or no longer exists' }, 401);
    }
    c.set('user', {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        project_ids: user.project_ids ?? [],
    });
    await next();
});
export const requireAdmin = createMiddleware(async (c, next) => {
    const user = c.get('user');
    if (!user || user.role !== 'admin') {
        return c.json({ error: 'Admin access required' }, 403);
    }
    await next();
});
