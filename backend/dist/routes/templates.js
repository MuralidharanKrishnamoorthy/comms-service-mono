import { Hono } from 'hono';
import { ObjectId, MongoServerError } from 'mongodb';
import { getDb } from '../db.js';
import { createTemplateSchema, updateChannelContentSchema, normalizeTemplateKey, } from '../models/template.js';
import { hasProjectAccess } from '../lib/access.js';
export const templatesRoute = new Hono();
function withVersionAndLive(content) {
    return { ...content, version: 1, live: true };
}
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
            ...(parsed.data.channels.email ? { email: withVersionAndLive(parsed.data.channels.email) } : {}),
            ...(parsed.data.channels.sms ? { sms: withVersionAndLive(parsed.data.channels.sms) } : {}),
            ...(parsed.data.channels.push ? { push: withVersionAndLive(parsed.data.channels.push) } : {}),
        },
        created_at: new Date(),
        updated_at: new Date(),
    };
    try {
        const result = await db.collection('templates').insertOne(template);
        return c.json({ id: result.insertedId, ...template }, 201);
    }
    catch (err) {
        if (err instanceof MongoServerError && err.code === 11000) {
            return c.json({ error: `template_key "${parsed.data.template_key}" already exists for this project` }, 409);
        }
        throw err;
    }
});
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
templatesRoute.get('/:templateKey', async (c) => {
    const projectId = c.req.param('projectId');
    const templateKey = normalizeTemplateKey(c.req.param('templateKey') ?? '');
    if (!projectId || !ObjectId.isValid(projectId)) {
        return c.json({ error: 'Invalid projectId' }, 400);
    }
    if (!(await hasProjectAccess(c.get('user'), projectId))) {
        return c.json({ error: 'You do not have access to this project' }, 403);
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
templatesRoute.patch('/:templateKey/:channel', async (c) => {
    const projectId = c.req.param('projectId');
    const templateKey = normalizeTemplateKey(c.req.param('templateKey') ?? '');
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
// Delete a template. Cascades: pulls it out of every category's `templates`
// array, matched by template_id — the real foreign key, immune to a
// template_key ever being reused. No such reuse is possible today (template_key
// is immutable), but the cascade means a category can never end up pointing at
// a template that no longer exists.
templatesRoute.delete('/:templateKey', async (c) => {
    const projectId = c.req.param('projectId');
    const templateKey = normalizeTemplateKey(c.req.param('templateKey') ?? '');
    if (!projectId || !ObjectId.isValid(projectId)) {
        return c.json({ error: 'Invalid projectId' }, 400);
    }
    if (!(await hasProjectAccess(c.get('user'), projectId))) {
        return c.json({ error: 'You do not have access to this project' }, 403);
    }
    const db = getDb();
    const template = await db.collection('templates').findOne({
        project_id: new ObjectId(projectId),
        template_key: templateKey,
    });
    if (!template) {
        return c.json({ error: 'Template not found' }, 404);
    }
    await db.collection('templates').deleteOne({ _id: template._id });
    await db
        .collection('categories')
        .updateMany({ 'templates.template_id': template._id }, { $pull: { templates: { template_id: template._id } } });
    return c.json({ deleted: true });
});
