import { Hono } from 'hono'
import { ObjectId, MongoServerError } from 'mongodb'
import { getDb } from '../db.js'
import { createCategorySchema, type Category, type TemplateCategoryLink } from '../models/category.js'
import type { Template } from '../models/template.js'
import type { AuthEnv } from '../middleware/dashboardAuth.js'
import { hasProjectAccess } from '../lib/access.js'

// Mounted at /categories — global, not scoped to a project. A template from
// any project can be attached to any category; the join collection carries
// the project_id since template_key is only unique within a project.
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
  const db = getDb()
  const categories = await db.collection<Category>('categories').find({}).sort({ name: 1 }).toArray()

  const counts = await db
    .collection<TemplateCategoryLink>('template_categories')
    .aggregate<{ _id: ObjectId; count: number }>([{ $group: { _id: '$category_id', count: { $sum: 1 } } }])
    .toArray()
  const countByCategory = new Map(counts.map((row) => [row._id.toString(), row.count]))

  return c.json(
    categories.map((cat) => ({ ...cat, template_count: countByCategory.get(cat._id!.toString()) ?? 0 }))
  )
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

  const [templates, links] = await Promise.all([
    db.collection<Template>('templates').find({ project_id: new ObjectId(projectId) }).toArray(),
    db
      .collection<TemplateCategoryLink>('template_categories')
      .find({ category_id: new ObjectId(categoryId), project_id: new ObjectId(projectId) })
      .toArray(),
  ])
  const attachedKeys = new Set(links.map((l) => l.template_key))

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

  const link: TemplateCategoryLink = {
    category_id: new ObjectId(categoryId),
    project_id: new ObjectId(projectId),
    template_key: templateKey,
    created_at: new Date(),
  }

  try {
    await db.collection<TemplateCategoryLink>('template_categories').insertOne(link)
  } catch (err) {
    // Already attached — treat as a no-op success rather than an error.
    if (!(err instanceof MongoServerError && err.code === 11000)) throw err
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

  const db = getDb()
  await db.collection<TemplateCategoryLink>('template_categories').deleteOne({
    category_id: new ObjectId(categoryId),
    project_id: new ObjectId(projectId),
    template_key: templateKey,
  })

  return c.json({ attached: false })
})
