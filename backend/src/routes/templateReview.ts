import { Hono } from 'hono'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import {
  rejectTemplateSchema,
  TEMPLATE_STATUS_FILTERS,
  type Template,
  type TemplateStatusFilter,
} from '../models/template.js'
import type { Project } from '../models/project.js'
import type { User } from '../models/user.js'
import { requireAdmin, type AuthEnv } from '../middleware/dashboardAuth.js'
import { allowedProjectIds } from '../lib/access.js'
import { approvalFields, rejectionFields, statusFilter } from '../lib/templateReview.js'

// Cross-project, review-oriented views of templates. Unlike the project-scoped
// CRUD in routes/templates.ts, these span every project the caller may see —
// the admin review queue and the "what can I actually use" list are both
// inherently project-agnostic.
export const templateReviewRoute = new Hono<AuthEnv>()

// GET /templates
//   Admin  -> the review queue across all projects, filtered by ?status
//            (pending | approved | rejected | all), defaulting to pending.
//   Others -> only the templates they themselves created, across their projects,
//            with full status/reviewed_at/rejection_reason for their own tracking.
// Admin rows are enriched with creator name and project name for the queue UI.
templateReviewRoute.get('/', async (c) => {
  const user = c.get('user')
  const db = getDb()

  if (user.role !== 'admin') {
    const templates = await db
      .collection<Template>('templates')
      .find({ created_by: user._id })
      .sort({ updated_at: -1 })
      .toArray()
    return c.json(templates)
  }

  const raw = c.req.query('status') ?? 'pending'
  if (!TEMPLATE_STATUS_FILTERS.includes(raw as TemplateStatusFilter)) {
    return c.json({ error: `status must be one of: ${TEMPLATE_STATUS_FILTERS.join(', ')}` }, 400)
  }

  const templates = await db
    .collection<Template>('templates')
    .find(statusFilter(raw as TemplateStatusFilter))
    // Oldest submission first — the review queue is a FIFO worklist.
    .sort({ created_at: 1 })
    .toArray()

  // Hydrate creator + project names in two batched lookups rather than per-row.
  const creatorIds = [...new Set(templates.map((t) => t.created_by?.toString()).filter(Boolean))].map(
    (id) => new ObjectId(id as string)
  )
  const projectIds = [...new Set(templates.map((t) => t.project_id.toString()))].map((id) => new ObjectId(id))

  const [creators, projects] = await Promise.all([
    db
      .collection<User>('users')
      .find({ _id: { $in: creatorIds } }, { projection: { name: 1, email: 1 } })
      .toArray(),
    db
      .collection<Project>('projects')
      .find({ _id: { $in: projectIds } }, { projection: { name: 1 } })
      .toArray(),
  ])
  const creatorById = new Map(creators.map((u) => [u._id!.toString(), u]))
  const projectById = new Map(projects.map((p) => [p._id!.toString(), p]))

  return c.json(
    templates.map((t) => {
      const creator = t.created_by ? creatorById.get(t.created_by.toString()) : undefined
      return {
        ...t,
        creator_name: creator?.name ?? null,
        creator_email: creator?.email ?? null,
        project_name: projectById.get(t.project_id.toString())?.name ?? null,
      }
    })
  )
})

// GET /templates/usable
// The approved templates the caller is allowed to apply elsewhere. Admins see
// every approved template; everyone else sees approved templates in the projects
// they have access to. This is the server-side source of truth for any picker;
// the frontend must not infer usability from a raw template list.
templateReviewRoute.get('/usable', async (c) => {
  const user = c.get('user')
  const allowed = allowedProjectIds(user)
  const query: Record<string, unknown> = { status: 'approved' }
  if (allowed !== null) {
    query.project_id = { $in: allowed }
  }

  const templates = await getDb()
    .collection<Template>('templates')
    .find(query)
    .sort({ project_id: 1, template_key: 1 })
    .toArray()

  return c.json(templates)
})

// PATCH /templates/:id/approve  (admin only)
templateReviewRoute.patch('/:id/approve', requireAdmin, async (c) => {
  const id = c.req.param('id')
  if (!ObjectId.isValid(id)) return c.json({ error: 'Invalid template id' }, 400)

  const db = getDb()
  const fields = approvalFields(c.get('user')._id, new Date())
  const result = await db
    .collection<Template>('templates')
    .findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...fields, updated_at: new Date() } },
      { returnDocument: 'after' }
    )

  if (!result) return c.json({ error: 'Template not found' }, 404)
  return c.json(result)
})

// PATCH /templates/:id/reject  (admin only). Body: { reason?: string }
templateReviewRoute.patch('/:id/reject', requireAdmin, async (c) => {
  const id = c.req.param('id')
  if (!ObjectId.isValid(id)) return c.json({ error: 'Invalid template id' }, 400)

  const body = await c.req.json().catch(() => ({}))
  const parsed = rejectTemplateSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const db = getDb()
  const fields = rejectionFields(c.get('user')._id, parsed.data.reason, new Date())
  const result = await db
    .collection<Template>('templates')
    .findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...fields, updated_at: new Date() } },
      { returnDocument: 'after' }
    )

  if (!result) return c.json({ error: 'Template not found' }, 404)
  return c.json(result)
})
