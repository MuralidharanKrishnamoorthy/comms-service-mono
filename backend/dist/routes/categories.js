import { Hono } from 'hono';
import { ObjectId, MongoServerError } from 'mongodb';
import { getDb } from '../db.js';
import { createCategorySchema, updateCategorySchema, } from '../models/category.js';
import { hasProjectAccess } from '../lib/access.js';
export const categoriesRoute = new Hono();
async function resolveAttachments(user, requested) {
    const distinctProjectIds = [...new Set(requested.map((t) => t.project_id))];
    for (const projectId of distinctProjectIds) {
        if (!hasProjectAccess(user, projectId)) {
            return { ok: false, status: 403, error: 'You do not have access to one of these projects' };
        }
    }
    const templates = await getDb()
        .collection('templates')
        .find({
        $or: requested.map((t) => ({
            project_id: new ObjectId(t.project_id),
            template_key: t.template_key,
        })),
    })
        .toArray();
    const byKey = new Map(templates.map((t) => [`${t.project_id.toString()}:${t.template_key}`, t]));
    const now = new Date();
    const attachments = new Map();
    for (const req of requested) {
        const lookupKey = `${req.project_id}:${req.template_key}`;
        const template = byKey.get(lookupKey);
        if (!template) {
            return { ok: false, status: 404, error: `Template "${req.template_key}" not found` };
        }
        // Keyed by project+template so the same pair sent twice attaches once.
        attachments.set(lookupKey, {
            project_id: template.project_id,
            template_id: template._id,
            template_key: template.template_key,
            created_at: now,
        });
    }
    return { ok: true, attachments: [...attachments.values()] };
}
/**
 * Whether this user may rename or delete a whole category. Categories are
 * global, so a non-admin could otherwise rename or destroy a grouping built
 * entirely out of projects they cannot even see. Admins may always act; anyone
 * else needs access to every project represented in the category — which makes
 * an empty category editable by anyone.
 */
function canModifyCategory(user, category) {
    if (user.role === 'admin')
        return true;
    const projectIds = [...new Set(category.templates.map((t) => t.project_id.toString()))];
    return projectIds.every((projectId) => hasProjectAccess(user, projectId));
}
// Create a category, optionally with its first template attachments. Both land
// in a single insert, so a category is never left half-populated.
categoriesRoute.post('/', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
    }
    const requested = parsed.data.templates ?? [];
    let attachments = [];
    if (requested.length > 0) {
        const resolved = await resolveAttachments(c.get('user'), requested);
        if (!resolved.ok)
            return c.json({ error: resolved.error }, resolved.status);
        attachments = resolved.attachments;
    }
    const db = getDb();
    const category = {
        // Category names are stored upper-case whatever the caller typed, so
        // "Welcome", "welcome" and "WELCOME" are one category, not three — the
        // unique index on `name` then enforces that for free.
        name: parsed.data.name.trim().toUpperCase(),
        templates: attachments,
        created_at: new Date(),
    };
    try {
        const result = await db.collection('categories').insertOne(category);
        return c.json({ ...category, _id: result.insertedId, template_count: category.templates.length }, 201);
    }
    catch (err) {
        if (err instanceof MongoServerError && err.code === 11000) {
            return c.json({ error: `A category named "${category.name}" already exists` }, 409);
        }
        throw err;
    }
});
// List all categories with a live count of attached templates (across every project)
categoriesRoute.get('/', async (c) => {
    const categories = await getDb().collection('categories').find({}).sort({ name: 1 }).toArray();
    return c.json(categories.map((cat) => ({ ...cat, template_count: cat.templates.length })));
});
/**
 * One category with its attachments hydrated — template name and channels,
 * plus the owning project's name — across every project at once, so the
 * detail screen can show what's actually in the category without first
 * asking which project to look at.
 *
 * A non-admin only sees attachments from projects they can access; the rest
 * are reported as a count so the page can say "3 more in projects you can't
 * see" rather than silently under-reporting the category's size.
 */
categoriesRoute.get('/:categoryId', async (c) => {
    const categoryId = c.req.param('categoryId');
    if (!ObjectId.isValid(categoryId))
        return c.json({ error: 'Invalid categoryId' }, 400);
    const db = getDb();
    const category = await db.collection('categories').findOne({ _id: new ObjectId(categoryId) });
    if (!category)
        return c.json({ error: 'Category not found' }, 404);
    const user = c.get('user');
    const visible = category.templates.filter((t) => hasProjectAccess(user, t.project_id.toString()));
    const hiddenCount = category.templates.length - visible.length;
    const [templates, projects] = await Promise.all([
        db
            .collection('templates')
            .find({ _id: { $in: visible.map((t) => t.template_id) } })
            .toArray(),
        db
            .collection('projects')
            .find({ _id: { $in: visible.map((t) => t.project_id) } }, { projection: { name: 1 } })
            .toArray(),
    ]);
    const templateById = new Map(templates.map((t) => [t._id.toString(), t]));
    const projectNameById = new Map(projects.map((p) => [p._id.toString(), p.name]));
    return c.json({
        category: { _id: category._id, name: category.name, created_at: category.created_at },
        attached: visible
            // A template deleted outside the cascade would leave a dangling id;
            // skip it rather than emitting a half-empty row.
            .filter((a) => templateById.has(a.template_id.toString()))
            .map((a) => {
            const template = templateById.get(a.template_id.toString());
            return {
                template_id: a.template_id,
                template_key: a.template_key,
                name: template.name,
                channels: template.channels,
                project_id: a.project_id,
                project_name: projectNameById.get(a.project_id.toString()) ?? 'Unknown project',
                attached_at: a.created_at,
            };
        }),
        hidden_count: hiddenCount,
    });
});
// Edit a category: rename it, replace its attachments, or both, in one write.
// `templates` is the COMPLETE set the caller wants — anything absent from it
// is detached, which is how unchecking a box in the edit dialog removes a
// template.
categoriesRoute.patch('/:categoryId', async (c) => {
    const categoryId = c.req.param('categoryId');
    if (!ObjectId.isValid(categoryId))
        return c.json({ error: 'Invalid categoryId' }, 400);
    const body = await c.req.json().catch(() => null);
    const parsed = updateCategorySchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
    }
    const db = getDb();
    const category = await db.collection('categories').findOne({ _id: new ObjectId(categoryId) });
    if (!category)
        return c.json({ error: 'Category not found' }, 404);
    const user = c.get('user');
    // Access to the category as it stands today...
    if (!canModifyCategory(user, category)) {
        return c.json({ error: 'This category holds templates from projects you cannot access' }, 403);
    }
    const set = {};
    if (parsed.data.name !== undefined)
        set.name = parsed.data.name.trim().toUpperCase();
    // ...and, separately, to every project in the set being written.
    if (parsed.data.templates !== undefined) {
        const resolved = await resolveAttachments(user, parsed.data.templates);
        if (!resolved.ok)
            return c.json({ error: resolved.error }, resolved.status);
        set.templates = resolved.attachments;
    }
    try {
        await db.collection('categories').updateOne({ _id: category._id }, { $set: set });
    }
    catch (err) {
        if (err instanceof MongoServerError && err.code === 11000) {
            return c.json({ error: `A category named "${set.name}" already exists` }, 409);
        }
        throw err;
    }
    const updated = { ...category, ...set };
    return c.json({ ...updated, template_count: updated.templates.length });
});
// Delete a category. Only the grouping goes away — the templates it pointed at
// are untouched, since attachments live on this document and nowhere else.
categoriesRoute.delete('/:categoryId', async (c) => {
    const categoryId = c.req.param('categoryId');
    if (!ObjectId.isValid(categoryId))
        return c.json({ error: 'Invalid categoryId' }, 400);
    const db = getDb();
    const category = await db.collection('categories').findOne({ _id: new ObjectId(categoryId) });
    if (!category)
        return c.json({ error: 'Category not found' }, 404);
    if (!canModifyCategory(c.get('user'), category)) {
        return c.json({ error: 'This category holds templates from projects you cannot access' }, 403);
    }
    await db.collection('categories').deleteOne({ _id: category._id });
    return c.json({ deleted: true, detached: category.templates.length });
});
