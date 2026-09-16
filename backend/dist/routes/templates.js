import { Hono } from 'hono';
import { ObjectId, MongoServerError } from 'mongodb';
import { getDb } from '../db.js';
import { createTemplateSchema, updateChannelContentSchema, normalizeTemplateKey, TEMPLATE_STATUS_FILTERS, } from '../models/template.js';
import { hasProjectAccess } from '../lib/access.js';
import { autoApprovedReviewFields, initialReviewFields, resetReviewForEdit, } from '../lib/templateReview.js';
export const templatesRoute = new Hono();
templatesRoute.use('*', async (c, next) => {
    const projectId = c.req.param('projectId');
    if (!projectId || !ObjectId.isValid(projectId)) {
        return c.json({ error: 'Invalid projectId' }, 400);
    }
    if (!hasProjectAccess(c.get('user'), projectId)) {
        return c.json({ error: 'You do not have access to this project' }, 403);
    }
    await next();
});
function withVersionAndLive(content) {
    return { ...content, version: 1, live: true };
}
templatesRoute.post('/', async (c) => {
    const projectId = c.req.param('projectId');
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
    // An admin's own template is trusted and born approved; everyone else's starts
    // pending, awaiting an admin's review. Either way the status/review fields are
    // set here from the caller's role, never taken from the request body.
    const user = c.get('user');
    const now = new Date();
    const reviewFields = user.role === 'admin' ? autoApprovedReviewFields(user._id, now) : initialReviewFields();
    const template = {
        project_id: new ObjectId(projectId),
        template_key: parsed.data.template_key,
        name: parsed.data.name,
        channels: {
            ...(parsed.data.channels.email ? { email: withVersionAndLive(parsed.data.channels.email) } : {}),
            ...(parsed.data.channels.sms ? { sms: withVersionAndLive(parsed.data.channels.sms) } : {}),
            ...(parsed.data.channels.push ? { push: withVersionAndLive(parsed.data.channels.push) } : {}),
        },
        ...reviewFields,
        created_by: user._id,
        created_at: now,
        updated_at: now,
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
    const user = c.get('user');
    const query = { project_id: new ObjectId(projectId) };
    if (user.role === 'admin') {
        // Admins manage every template in the project and may narrow by review
        // status (?status=pending|approved|rejected). Absent/"all" → no filter, so
        // the management view keeps showing everything by default.
        const raw = c.req.query('status');
        if (raw && raw !== 'all') {
            if (!TEMPLATE_STATUS_FILTERS.includes(raw)) {
                return c.json({ error: `status must be one of: ${TEMPLATE_STATUS_FILTERS.join(', ')}` }, 400);
            }
            query.status = raw;
        }
    }
    else {
        // A non-admin only ever sees the templates they themselves created.
        query.created_by = user._id;
    }
    const db = getDb();
    const templates = await db
        .collection('templates')
        .find(query)
        .sort({ updated_at: -1 })
        .toArray();
    return c.json(templates);
});
templatesRoute.get('/:templateKey', async (c) => {
    const projectId = c.req.param('projectId');
    const templateKey = normalizeTemplateKey(c.req.param('templateKey') ?? '');
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
    // Any content change invalidates a prior review: an approved or rejected
    // template drops back to "pending" and its audit fields clear. Already-pending
    // templates are left as they are (resetReviewForEdit returns null).
    const reviewReset = resetReviewForEdit(template.status);
    await db.collection('templates').updateOne({ project_id: new ObjectId(projectId), template_key: templateKey }, { $set: { [`channels.${channel}`]: updatedChannel, updated_at: new Date(), ...(reviewReset ?? {}) } });
    return c.json({
        ...template,
        channels: { ...template.channels, [channel]: updatedChannel },
        ...(reviewReset ?? {}),
    });
});
// Delete a template. Cascades: pulls it out of every category's `templates`
// array, matched by template_id — the real foreign key, immune to a
// template_key ever being reused. No such reuse is possible today (template_key
// is immutable), but the cascade means a category can never end up pointing at
// a template that no longer exists.
templatesRoute.delete('/:templateKey', async (c) => {
    const projectId = c.req.param('projectId');
    const templateKey = normalizeTemplateKey(c.req.param('templateKey') ?? '');
    const db = getDb();
    const template = await db.collection('templates').findOne({
        project_id: new ObjectId(projectId),
        template_key: templateKey,
    });
    if (!template) {
        return c.json({ error: 'Template not found' }, 404);
    }
    // A category is reachable only through the projects of its templates, so one
    // that would be left empty belongs to no project: invisible to every member
    // and deletable by none. Rather than quietly destroying a named grouping as
    // a side effect, say which categories would go and make the caller ask again
    // with ?delete_orphaned_categories=true.
    const orphaned = await db
        .collection('categories')
        .find({ 'templates.template_id': template._id, templates: { $size: 1 } }, { projection: { name: 1 } })
        .toArray();
    const confirmed = c.req.query('delete_orphaned_categories') === 'true';
    if (orphaned.length > 0 && !confirmed) {
        const names = orphaned.map((cat) => `"${cat.name}"`).join(', ');
        return c.json({
            error: `"${template.template_key}" is the only template in ${names}. ` +
                `Deleting it would leave ${orphaned.length === 1 ? 'that category' : 'those categories'} empty, ` +
                `so ${orphaned.length === 1 ? 'it' : 'they'} would be removed too. ` +
                'Detach the template first, or repeat this request with ?delete_orphaned_categories=true.',
            orphaned_categories: orphaned.map((cat) => ({ _id: cat._id, name: cat.name })),
        }, 409);
    }
    await db.collection('templates').deleteOne({ _id: template._id });
    await db
        .collection('categories')
        .updateMany({ 'templates.template_id': template._id }, { $pull: { templates: { template_id: template._id } } });
    // Exactly the categories identified above — a targeted delete, so a category
    // left empty by some other route is never swept up by this one.
    if (orphaned.length > 0) {
        await db
            .collection('categories')
            .deleteMany({ _id: { $in: orphaned.map((cat) => cat._id) } });
    }
    return c.json({
        deleted: true,
        categories_removed: orphaned.map((cat) => ({ _id: cat._id, name: cat.name })),
    });
});
