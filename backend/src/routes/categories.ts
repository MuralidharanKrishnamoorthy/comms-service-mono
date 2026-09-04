import { Hono } from 'hono'
import { ObjectId, MongoServerError } from 'mongodb'
import { getDb } from '../db.js'
import { createCategorySchema, type Category } from '../models/category.js'
import type { Template } from '../models/template.js'
import type { AuthEnv } from '../middleware/dashboardAuth.js'
import { hasProjectAccess } from '../lib/access.js'

// Mounted at /categories — global, not scoped to a project. A template from
// any project can be attached to any category; each attachment carries its
// own project_id since template_key is only unique within a project.
// Category metadata is visible to any authenticated user, but the endpoints
// that read/modify a specific project's templates enforce project access.
export const categoriesRoute = new Hono<AuthEnv>()

// Create a category
categoriesRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createCategorySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const db = getDb()
  const category: Category = {
    name: parsed.data.name.trim(),
    templates: [],
    created_at: new Date(),
  }

  try {
    const result = await db.collection<Category>('categories').insertOne(category)
    return c.json({ ...category, _id: result.insertedId, template_count: 0 }, 201)
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

// Attach a template (from a specific project) to a category
categoriesRoute.post('/:categoryId/projects/:projectId/templates/:templateKey', async (c) => {
  const categoryId = c.req.param('categoryId')
  const projectId = c.req.param('projectId')
  const templateKey = c.req.param('templateKey')
  if (!ObjectId.isValid(categoryId)) return c.json({ error: 'Invalid categoryId' }, 400)
  if (!ObjectId.isValid(projectId)) return c.json({ error: 'Invalid projectId' }, 400)
  if (!(await hasProjectAccess(c.get('user'), projectId)))
    return c.json({ error: 'You do not have access to this project' }, 403)

  const db = getDb()
  const [category, template] = await Promise.all([
    db.collection<Category>('categories').findOne({ _id: new ObjectId(categoryId) }),
    db.collection<Template>('templates').findOne({ project_id: new ObjectId(projectId), template_key: templateKey }),
  ])
  if (!category) return c.json({ error: 'Category not found' }, 404)
  if (!template) return c.json({ error: `Template "${templateKey}" not found` }, 404)

  const alreadyAttached = category.templates.some(
    (t) => t.project_id.equals(projectId) && t.template_key === templateKey
  )
  if (!alreadyAttached) {
    await db.collection<Category>('categories').updateOne(
      { _id: new ObjectId(categoryId) },
      {
        $push: {
          templates: {
            project_id: new ObjectId(projectId),
            template_id: template._id!,
            template_key: templateKey,
            created_at: new Date(),
          },
        },
      }
    )
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
