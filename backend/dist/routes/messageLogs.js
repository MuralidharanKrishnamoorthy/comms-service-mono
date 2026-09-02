import { Hono } from 'hono';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { hasProjectAccess } from '../lib/access.js';
// Mounted at /projects/:projectId/logs — dashboard view of send history.
export const messageLogsRoute = new Hono();
messageLogsRoute.get('/', async (c) => {
    const projectId = c.req.param('projectId');
    if (!projectId || !ObjectId.isValid(projectId)) {
        return c.json({ error: 'Invalid projectId' }, 400);
    }
    if (!(await hasProjectAccess(c.get('user'), projectId))) {
        return c.json({ error: 'You do not have access to this project' }, 403);
    }
    const status = c.req.query('status');
    const channel = c.req.query('channel');
    const templateKey = c.req.query('template_key');
    const filter = { project_id: new ObjectId(projectId) };
    if (status)
        filter.status = status;
    if (channel)
        filter.channel = channel;
    if (templateKey)
        filter.template_key = templateKey;
    const db = getDb();
    const logs = await db
        .collection('message_logs')
        .find(filter)
        .sort({ created_at: -1 })
        .limit(200)
        .toArray();
    return c.json(logs);
});
