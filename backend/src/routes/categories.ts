import { Hono } from 'hono'
import { ObjectId, MongoServerError } from 'mongodb'
import { getDb } from '../db.js'
import { createCategorySchema, type AttachedTemplate, type Category } from '../models/category.js'
import type { Template } from '../models/template.js'
import type { AuthEnv } from '../middleware/dashboardAuth.js'
import { hasProjectAccess } from '../lib/access.js'
import type { AuthUser } from '../middleware/dashboardAuth.js'

// Mounted at /categories — global, not scoped to a project. A template from
// any project can be attached to any category; each attachment carries its
// own project_id since template_key is only unique within a project.
// Category metadata is visible to any authenticated user, but the endpoints
// that read/modify a specific project's templates enforce project access.
export const categoriesRoute = new Hono<AuthEnv>()

type RequestedTemplate = { project_id: string; template_key: string }

/**
 * Turns the (project_id, template_key) pairs a caller asked for into storable
 * attachments. Every distinct project is access-checked before any of its
 * templates are read, so a caller can never attach — or probe for the
 * existence of — a template in a project they can't see. Duplicates in the
 * request collapse to one attachment.
 *
 * Returns either the resolved attachments or the error to send back.
 */
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

  // One query for every requested template rather than one per template.
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

// Create a category, optionally with its first template attachments. Both land
// in a single insert, so a category is never left half-populated.
categoriesRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createCategorySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const requested = parsed.data.templates ?? []
  let attachments: AttachedTemplate[] = []
  if (requested.length > 0) {
    const resolved = await resolveAttachments(c.get('user'), requested)
    if (!resolved.ok) return c.json({ error: resolved.error }, resolved.status)
    attachments = resolved.attachments
  }

  const db = getDb()
  const category: Category = {
    // Category names are stored upper-case whatever the caller typed, so
    // "Welcome", "welcome" and "WELCOME" are one category, not three — the
    // unique index on `name` then enforces that for free.
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
      return c.json({ error: `A category named "${category.name}" already exists` }, 409)
    }
    throw err
  }
})

// List all categories with a live count of attached templates (across every project)
categoriesRoute.get('/', async (c) => {
  const categories = await getDb().collection<Category>('categories').find({}).sort({ name: 1 }).toArray()
  return c.json(categories.map((cat) => ({ ...cat, template_count: cat.templates.length })))
})

// All templates in one project, each flagged whether it's attached to this category
categoriesRoute.get('/:categoryId/projects/:projectId/templates', async (c) => {
  const categoryId = c.req.param('categoryId')
  const projectId = c.req.param('projectId')
  if (!ObjectId.isValid(categoryId)) return c.json({ error: 'Invalid categoryId' }, 400)
  if (!ObjectId.isValid(projectId)) return c.json({ error: 'Invalid projectId' }, 400)
  if (!(await hasProjectAccess(c.get('user'), projectId)))
    return c.json({ error: 'You do not have access to this project' }, 403)

  const db = getDb()
  const category = await db.collection<Category>('categories').findOne({ _id: new ObjectId(categoryId) })
  if (!category) return c.json({ error: 'Category not found' }, 404)

  const templates = await db
    .collection<Template>('templates')
    .find({ project_id: new ObjectId(projectId) })
    .toArray()
  const attachedKeys = new Set(
    category.templates.filter((t) => t.project_id.equals(projectId)).map((t) => t.template_key)
  )

  return c.json({
    category,
    templates: templates.map((t) => ({ ...t, attached: attachedKeys.has(t.template_key) })),
  })
})

// Attach a template (from a specific project) to an EXISTING category. Adding
// templates at creation time goes through POST / instead; both resolve the
// attachment the same way, via resolveAttachments.
categoriesRoute.post('/:categoryId/projects/:projectId/templates/:templateKey', async (c) => {
  const categoryId = c.req.param('categoryId')
  const projectId = c.req.param('projectId')
  const templateKey = c.req.param('templateKey')
  if (!ObjectId.isValid(categoryId)) return c.json({ error: 'Invalid categoryId' }, 400)
  if (!ObjectId.isValid(projectId)) return c.json({ error: 'Invalid projectId' }, 400)

  const db = getDb()
  const category = await db.collection<Category>('categories').findOne({ _id: new ObjectId(categoryId) })
  if (!category) return c.json({ error: 'Category not found' }, 404)

  const resolved = await resolveAttachments(c.get('user'), [
    { project_id: projectId, template_key: templateKey },
  ])
  if (!resolved.ok) return c.json({ error: resolved.error }, resolved.status)

  const alreadyAttached = category.templates.some(
    (t) => t.project_id.equals(projectId) && t.template_key === templateKey
  )
  if (!alreadyAttached) {
    await db
      .collection<Category>('categories')
      .updateOne({ _id: category._id }, { $push: { templates: resolved.attachments[0] } })
  }

  return c.json({ attached: true }, 201)
})

// Detach a template (from a specific project) from a category
categoriesRoute.delete('/:categoryId/projects/:projectId/templates/:templateKey', async (c) => {
  const categoryId = c.req.param('categoryId')
  const projectId = c.req.param('projectId')
  const templateKey = c.req.param('templateKey')
  if (!ObjectId.isValid(categoryId)) return c.json({ error: 'Invalid categoryId' }, 400)
  if (!ObjectId.isValid(projectId)) return c.json({ error: 'Invalid projectId' }, 400)
  if (!(await hasProjectAccess(c.get('user'), projectId)))
    return c.json({ error: 'You do not have access to this project' }, 403)

  await getDb()
    .collection<Category>('categories')
    .updateOne(
      { _id: new ObjectId(categoryId) },
      { $pull: { templates: { project_id: new ObjectId(projectId), template_key: templateKey } } }
    )

  return c.json({ attached: false })
})
