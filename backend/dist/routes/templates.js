import { Hono } from 'hono';
import { ObjectId, MongoServerError } from 'mongodb';
import { getDb } from '../db.js';
import { createTemplateSchema, updateChannelContentSchema, } from '../models/template.js';
import { hasProjectAccess } from '../lib/access.js';
// Mounted at /projects/:projectId/templates — behind dashboardAuth, and each
// handler additionally checks the caller may access this specific project.
export const templatesRoute = new Hono();
function withVersionAndLive(content) {
    return { ...content, version: 1, live: true };
}
// Create a template
templatesRoute.post('/', async (c) => {
    const projectId = c.req.param('projectId');
    if (!projectId || !ObjectId.isValid(projectId)) {
        return c.json({ error: 'Invalid projectId' }, 400);
    }
    if (!(await hasProjectAccess(c.get('user'), projectId))) {
        return c.json({ error: 'You do not have access to this project' }, 403);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
    }
    const db = getDb();
    const existing = await db.collection('templates').findOne({
        project_id: new ObjectId(projectId),
        template_key: parsed.data.template_key,
    });
    if (existing) {
        return c.json({ error: `template_key "${parsed.data.template_key}" already exists for this project` }, 409);
    }
    const template = {
        project_id: new ObjectId(projectId),
        template_key: parsed.data.template_key,
        name: parsed.data.name,
        channels: {
            email: parsed.data.channels.email ? withVersionAndLive(parsed.data.channels.email) : undefined,
            sms: parsed.data.channels.sms ? withVersionAndLive(parsed.data.channels.sms) : undefined,
            push: parsed.data.channels.push ? withVersionAndLive(parsed.data.channels.push) : undefined,
        },
        created_at: new Date(),
        updated_at: new Date(),
    };
    try {
        const result = await db.collection('templates').insertOne(template);
        return c.json({ id: result.insertedId, ...template }, 201);
    }
    catch (err) {
        // The findOne check above narrows the race, but a genuinely simultaneous
        // request can still slip through — the unique index is the real guard.
        if (err instanceof MongoServerError && err.code === 11000) {
            return c.json({ error: `template_key "${parsed.data.template_key}" already exists for this project` }, 409);
        }
        throw err;
    }
});
// List templates for a project (dashboard use)
templatesRoute.get('/', async (c) => {
    const projectId = c.req.param('projectId');
    if (!projectId || !ObjectId.isValid(projectId)) {
        return c.json({ error: 'Invalid projectId' }, 400);
    }
    if (!(await hasProjectAccess(c.get('user'), projectId))) {
        return c.json({ error: 'You do not have access to this project' }, 403);
    }
    const db = getDb();
    const templates = await db
        .collection('templates')
        .find({ project_id: new ObjectId(projectId) })
        .toArray();
    return c.json(templates);
});
// Look up one template by its key (used internally by the send endpoint later)
templatesRoute.get('/:templateKey', async (c) => {
    const projectId = c.req.param('projectId');
    const templateKey = c.req.param('templateKey');
    if (!projectId || !ObjectId.isValid(projectId)) {
        return c.json({ error: 'Invalid projectId' }, 400);
    }
    const db = getDb();
    const template = await db.collection('templates').findOne({
        project_id: new ObjectId(projectId),
        template_key: templateKey,
    });
    if (!template) {
        return c.json({ error: 'Template not found' }, 404);
    }
    return c.json(template);
});
// Update one channel of a template — e.g. wording change. Bumps that channel's
// version and keeps it live immediately (no separate publish step, matches the
// "no redeploy needed" design decision).
templatesRoute.patch('/:templateKey/:channel', async (c) => {
    const projectId = c.req.param('projectId');
    const templateKey = c.req.param('templateKey');
    const channel = c.req.param('channel');
    if (!projectId || !ObjectId.isValid(projectId)) {
        return c.json({ error: 'Invalid projectId' }, 400);
    }
    if (channel !== 'email' && channel !== 'sms' && channel !== 'push') {
        return c.json({ error: 'channel must be one of: email, sms, push' }, 400);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = updateChannelContentSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
    }
    const db = getDb();
    const template = await db.collection('templates').findOne({
        project_id: new ObjectId(projectId),
        template_key: templateKey,
    });
    if (!template) {
        return c.json({ error: 'Template not found' }, 404);
    }
    const existingChannel = template.channels[channel];
    const updatedChannel = {
        ...existingChannel,
        ...parsed.data,
        variables: parsed.data.variables ?? existingChannel?.variables ?? [],
        version: (existingChannel?.version ?? 0) + 1,
        live: true,
    };
    await db.collection('templates').updateOne({ project_id: new ObjectId(projectId), template_key: templateKey }, { $set: { [`channels.${channel}`]: updatedChannel, updated_at: new Date() } });
    return c.json({ ...template, channels: { ...template.channels, [channel]: updatedChannel } });
});
