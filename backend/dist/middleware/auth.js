import { createMiddleware } from 'hono/factory';
import { getDb } from '../db.js';
import { hashApiKey } from '../lib/apiKey.js';
export const authMiddleware = createMiddleware(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Missing or malformed Authorization header' }, 401);
    }
    const key = authHeader.slice('Bearer '.length).trim();
    const hash = hashApiKey(key);
    const db = getDb();
    const apiKey = await db.collection('api_keys').findOne({ key_hash: hash });
    if (!apiKey) {
        return c.json({ error: 'Invalid API key' }, 401);
    }
    if (apiKey.status !== 'active') {
        return c.json({ error: 'API key has been revoked' }, 401);
    }
    if (apiKey.expires_at && apiKey.expires_at <= new Date()) {
        return c.json({ error: 'API key has expired' }, 401);
    }
    const project = await db.collection('projects').findOne({ _id: apiKey.project_id });
    if (!project) {
        return c.json({ error: 'Invalid API key' }, 401);
    }
    if (project.status !== 'active') {
        return c.json({ error: 'Project is disabled' }, 403);
    }
    c.set('project', project);
    await next();
});
