import { Hono } from 'hono'
import { ObjectId, MongoServerError, type Filter } from 'mongodb'
import { getDb } from '../db.js'
import {
  createCategorySchema,
  updateCategorySchema,
  type AttachedTemplate,
  type Category,
} from '../models/category.js'
import type { Template } from '../models/template.js'
import type { Project } from '../models/project.js'
import type { AuthEnv } from '../middleware/dashboardAuth.js'
import { allowedProjectIds, hasProjectAccess } from '../lib/access.js'
import type { AuthUser } from '../middleware/dashboardAuth.js'

export const categoriesRoute = new Hono<AuthEnv>()

type RequestedTemplate = { project_id: string; template_key: string }

async function resolveAttachments(
  user: AuthUser,
  requested: RequestedTemplate[]
): Promise<{ ok: true; attachments: AttachedTemplate[] } | { ok: false; status: 403 | 404; error: string }> {
  const distinctProjectIds = [...new Set(requested.map((t) => t.project_id))]
  for (const projectId of distinctProjectIds) {
    if (!hasProjectAccess(user, projectId)) {
      return { ok: false, status: 403, error: 'You do not have access to one of these projects' }
    }
  }

  const templates = await getDb()
    .collection<Template>('templates')
    .find({
      $or: requested.map((t) => ({
        project_id: new ObjectId(t.project_id),
        template_key: t.template_key,
      })),
    })
    .toArray()

  const byKey = new Map(templates.map((t) => [`${t.project_id.toString()}:${t.template_key}`, t]))
  const now = new Date()
  const attachments = new Map<string, AttachedTemplate>()

  for (const req of requested) {
    const lookupKey = `${req.project_id}:${req.template_key}`
    const template = byKey.get(lookupKey)
    if (!template) {
      return { ok: false, status: 404, error: `Template "${req.template_key}" not found` }
    }
    // Keyed by project+template so the same pair sent twice attaches once.
    attachments.set(lookupKey, {
      project_id: template.project_id,
      template_id: template._id!,
      template_key: template.template_key,
      created_at: now,
    })
  }

  return { ok: true, attachments: [...attachments.values()] }
}

/**
 * Whether this user may rename or delete a whole category. A non-admin could
 * otherwise rename or destroy a grouping built partly out of projects they
 * cannot even see. Admins may always act; anyone else needs access to every
 * project represented in the category.
 */
function canModifyCategory(user: AuthUser, category: Category): boolean {
  if (user.role === 'admin') return true
  const projectIds = [...new Set(category.templates.map((t) => t.project_id.toString()))]
  return projectIds.every((projectId) => hasProjectAccess(user, projectId))
}

/**
 * A category is visible to whoever shares a project with it. Two developers on
 * the same project see each other's groupings; someone on a different project
 * does not see them at all, which is why this is a query filter and not a
 * post-fetch check — the rows never leave the database.
 *
 * Admins get an empty filter, so they still see everything.
 */
function visibleToUser(user: AuthUser): Filter<Category> {
  const allowed = allowedProjectIds(user)
  return allowed === null ? {} : { 'templates.project_id': { $in: allowed } }
}

/**
 * The attachments this user is allowed to know about. A category can span
 * several projects, so sharing one project with it is enough to see the
 * category, but never enough to see the parts of it that live elsewhere.
 */
function visibleAttachments(user: AuthUser, category: Category): AttachedTemplate[] {
  return category.templates.filter((t) => hasProjectAccess(user, t.project_id.toString()))
}

// Create a category together with its template attachments. Both land in a
// single insert, so a category is never left half-populated — and since the
// attachments are what place it in a project, it is never left unreachable
// either.
categoriesRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createCategorySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const resolved = await resolveAttachments(c.get('user'), parsed.data.templates)
  if (!resolved.ok) return c.json({ error: resolved.error }, resolved.status)
  const attachments = resolved.attachments

  const db = getDb()
  const category: Category = {
    // Category names are stored upper-case whatever the caller typed, so
    // "Welcome", "welcome" and "WELCOME" are one category, not three. The
    // unique index on { templates.project_id, name } then enforces that within
    // each project, so a different team may still use the same name.
    name: parsed.data.name.trim().toUpperCase(),
    templates: attachments,
    created_at: new Date(),
  }

  try {
    const result = await db.collection<Category>('categories').insertOne(category)
    return c.json(
      { ...category, _id: result.insertedId, template_count: category.templates.length },
      201
    )
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      return c.json({ error: `A category named "${category.name}" already exists in one of these projects` }, 409)
    }
    throw err
  }
})

// Every category the caller shares a project with, each with a live count of
// its attached templates. `templates` carries only the attachments this user
// may see; `template_count` stays the true total, so a category reaching into
// a project they cannot access still reports its real size.
categoriesRoute.get('/', async (c) => {
  const user = c.get('user')
  const categories = await getDb()
    .collection<Category>('categories')
    .find(visibleToUser(user))
    .sort({ name: 1 })
    .toArray()

  return c.json(
    categories.map((cat) => ({
      ...cat,
      templates: visibleAttachments(user, cat),
      template_count: cat.templates.length,
    }))
  )
})

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
  const categoryId = c.req.param('categoryId')
  if (!ObjectId.isValid(categoryId)) return c.json({ error: 'Invalid categoryId' }, 400)

  const db = getDb()
  const category = await db.collection<Category>('categories').findOne({ _id: new ObjectId(categoryId) })
  if (!category) return c.json({ error: 'Category not found' }, 404)

  const user = c.get('user')
  const visible = visibleAttachments(user, category)
  // Sharing no project with this category means it should not exist as far as
  // this caller is concerned — 404 rather than 403, so the reply does not
  // confirm that a category by this id is there at all.
  if (user.role !== 'admin' && visible.length === 0) {
    return c.json({ error: 'Category not found' }, 404)
  }
  const hiddenCount = category.templates.length - visible.length

  const [templates, projects] = await Promise.all([
    db
      .collection<Template>('templates')
      .find({ _id: { $in: visible.map((t) => t.template_id) } })
      .toArray(),
    db
      .collection<Project>('projects')
      .find({ _id: { $in: visible.map((t) => t.project_id) } }, { projection: { name: 1 } })
      .toArray(),
  ])
  const templateById = new Map(templates.map((t) => [t._id!.toString(), t]))
  const projectNameById = new Map(projects.map((p) => [p._id!.toString(), p.name]))

  return c.json({
    category: { _id: category._id, name: category.name, created_at: category.created_at },
    attached: visible
      // A template deleted outside the cascade would leave a dangling id;
      // skip it rather than emitting a half-empty row.
      .filter((a) => templateById.has(a.template_id.toString()))
      .map((a) => {
        const template = templateById.get(a.template_id.toString())!
        return {
          template_id: a.template_id,
          template_key: a.template_key,
          name: template.name,
          channels: template.channels,
          project_id: a.project_id,
          project_name: projectNameById.get(a.project_id.toString()) ?? 'Unknown project',
          attached_at: a.created_at,
        }
      }),
    hidden_count: hiddenCount,
  })
})

// Edit a category: rename it, replace its attachments, or both, in one write.
// `templates` is the COMPLETE set the caller wants — anything absent from it
// is detached, which is how unchecking a box in the edit dialog removes a
// template.
categoriesRoute.patch('/:categoryId', async (c) => {
  const categoryId = c.req.param('categoryId')
  if (!ObjectId.isValid(categoryId)) return c.json({ error: 'Invalid categoryId' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = updateCategorySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const db = getDb()
  const category = await db.collection<Category>('categories').findOne({ _id: new ObjectId(categoryId) })
  if (!category) return c.json({ error: 'Category not found' }, 404)

  const user = c.get('user')
  // Invisible categories are reported as missing, exactly as the read does.
  if (user.role !== 'admin' && visibleAttachments(user, category).length === 0) {
    return c.json({ error: 'Category not found' }, 404)
  }
  // Access to the category as it stands today...
  if (!canModifyCategory(user, category)) {
    return c.json({ error: 'This category holds templates from projects you cannot access' }, 403)
  }

  const set: Partial<Category> = {}
  if (parsed.data.name !== undefined) set.name = parsed.data.name.trim().toUpperCase()

  // ...and, separately, to every project in the set being written.
  if (parsed.data.templates !== undefined) {
    const resolved = await resolveAttachments(user, parsed.data.templates)
    if (!resolved.ok) return c.json({ error: resolved.error }, resolved.status)
    set.templates = resolved.attachments
  }

  try {
    await db.collection<Category>('categories').updateOne({ _id: category._id }, { $set: set })
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      return c.json({ error: `A category named "${set.name}" already exists in one of these projects` }, 409)
    }
    throw err
  }

  const updated = { ...category, ...set }
  return c.json({ ...updated, template_count: updated.templates.length })
})

// Delete a category. Only the grouping goes away — the templates it pointed at
// are untouched, since attachments live on this document and nowhere else.
categoriesRoute.delete('/:categoryId', async (c) => {
  const categoryId = c.req.param('categoryId')
  if (!ObjectId.isValid(categoryId)) return c.json({ error: 'Invalid categoryId' }, 400)

  const db = getDb()
  const category = await db.collection<Category>('categories').findOne({ _id: new ObjectId(categoryId) })
  if (!category) return c.json({ error: 'Category not found' }, 404)

  const user = c.get('user')
  if (user.role !== 'admin' && visibleAttachments(user, category).length === 0) {
    return c.json({ error: 'Category not found' }, 404)
  }
  if (!canModifyCategory(user, category)) {
    return c.json({ error: 'This category holds templates from projects you cannot access' }, 403)
  }

  await db.collection<Category>('categories').deleteOne({ _id: category._id })

  return c.json({ deleted: true, detached: category.templates.length })
})
