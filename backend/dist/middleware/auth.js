import { createMiddleware } from 'hono/factory';
import { getDb } from '../db.js';
import { hashApiKey } from '../lib/apiKey.js';
/**
 * Verifies the "Authorization: Bearer <api_key>" header against a project's
 * stored key hash. On success, attaches the matched project to the request
 * context as c.get('project') for downstream handlers to use.
 */
export const authMiddleware = createMiddleware(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Missing or malformed Authorization header' }, 401);
    }
    const key = authHeader.slice('Bearer '.length).trim();
    const hash = hashApiKey(key);
    const db = getDb();
    const project = await db.collection('projects').findOne({ api_key_hash: hash });
    if (!project) {
        return c.json({ error: 'Invalid API key' }, 401);
    }
    if (project.status !== 'active') {
        return c.json({ error: 'Project is disabled' }, 403);
    }
    c.set('project', project);
    await next();
});
