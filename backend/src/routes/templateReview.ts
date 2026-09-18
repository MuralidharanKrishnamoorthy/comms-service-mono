import { Hono } from 'hono'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import {
  rejectTemplateSchema,
  returnTemplateSchema,
  TEMPLATE_STATUS_FILTERS,
  type Template,
  type TemplateStatusFilter,
} from '../models/template.js'
import { requireAdmin, type AuthEnv } from '../middleware/dashboardAuth.js'
import { approvalFields, rejectionFields, returnFields } from '../lib/templateReview.js'
import { allowedProjectIds, hasProjectAccess } from '../lib/access.js'
import { parsePageParams, paginationMeta, skipFor } from '../lib/pagination.js'

// Review actions on a template by its id, spanning every project — the approval
// decision belongs to an admin regardless of which project the template lives
// in, so these are mounted at /templates rather than under a single project.
export const templateReviewRoute = new Hono<AuthEnv>()

// GET /templates — the cross-project, paginated templates list behind the
// Templates page. `project` and `status` are optional filters applied before
// the page window; without `project` it spans every project the caller may see
// (all of them for an admin, their own for everyone else). Mirrors the /logs
// feed so both cross-project lists paginate the same way.
templateReviewRoute.get('/', async (c) => {
  const user = c.get('user')
  const db = getDb()

  const { page, limit } = parsePageParams(c.req.query('page'), c.req.query('limit'))
  const projectParam = c.req.query('project')
  const statusRaw = c.req.query('status')
  const needsReview = c.req.query('needs_review') === 'true'

  const filter: Record<string, unknown> = {}

  const allowed = allowedProjectIds(user)
  if (projectParam) {
    if (!ObjectId.isValid(projectParam)) return c.json({ error: 'Invalid project' }, 400)
    if (!hasProjectAccess(user, projectParam)) {
      return c.json({ error: 'You do not have access to this project' }, 403)
    }
    filter.project_id = new ObjectId(projectParam)
  } else if (allowed) {
    filter.project_id = { $in: allowed }
  }

  if (needsReview) {
    filter.$or = [{ status: 'pending' }, { pending_channels: { $exists: true } }]
  } else if (statusRaw && statusRaw !== 'all') {
    if (!TEMPLATE_STATUS_FILTERS.includes(statusRaw as TemplateStatusFilter)) {
      return c.json({ error: `status must be one of: ${TEMPLATE_STATUS_FILTERS.join(', ')}` }, 400)
    }
    filter.status = statusRaw
  }

  const col = db.collection<Template>('templates')
  const totalItems = await col.countDocuments(filter)
  const data = await col
    .aggregate<Template>([
      { $match: filter },
      {
        $addFields: {
          _needsReview: { $or: [{ $eq: ['$status', 'pending'] }, { $ifNull: ['$pending_channels', false] }] },
        },
      },
      { $sort: { _needsReview: -1, updated_at: -1 } },
      { $skip: skipFor(page, limit) },
      { $limit: limit },
      { $unset: '_needsReview' },
    ])
    .toArray()

  return c.json({ data, pagination: paginationMeta(page, limit, totalItems) })
})

async function discardPendingEdit(id: string) {
  return getDb()
    .collection<Template>('templates')
    .findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { updated_at: new Date() }, $unset: { pending_channels: '' } },
      { returnDocument: 'after' }
    )
}

// PATCH /templates/:id/approve  (admin only)
templateReviewRoute.patch('/:id/approve', requireAdmin, async (c) => {
  const id = c.req.param('id')
  if (!ObjectId.isValid(id)) return c.json({ error: 'Invalid template id' }, 400)

  const col = getDb().collection<Template>('templates')
  const template = await col.findOne({ _id: new ObjectId(id) })
  if (!template) return c.json({ error: 'Template not found' }, 404)

  const now = new Date()
  const fields = approvalFields(c.get('user')._id, now)
  const channels = template.pending_channels ?? template.channels

  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...fields, channels, updated_at: now }, $unset: { pending_channels: '' } },
    { returnDocument: 'after' }
  )

  if (!result) return c.json({ error: 'Template not found' }, 404)
  return c.json(result)
})

// PATCH /templates/:id/reject  (admin only). Body: { reason?: string }
templateReviewRoute.patch('/:id/reject', requireAdmin, async (c) => {
  const id = c.req.param('id')
  if (!ObjectId.isValid(id)) return c.json({ error: 'Invalid template id' }, 400)

  const col = getDb().collection<Template>('templates')
  const template = await col.findOne({ _id: new ObjectId(id) })
  if (!template) return c.json({ error: 'Template not found' }, 404)

  if (template.status === 'approved' && template.pending_channels) {
    return c.json(await discardPendingEdit(id))
  }

  const body = await c.req.json().catch(() => ({}))
  const parsed = rejectTemplateSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const now = new Date()
  const fields = rejectionFields(c.get('user')._id, parsed.data.reason, now)
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...fields, updated_at: now } },
    { returnDocument: 'after' }
  )

  if (!result) return c.json({ error: 'Template not found' }, 404)
  return c.json(result)
})

// PATCH /templates/:id/return  (admin only). Body: { remarks: string } — remarks
// are required (400 if missing/blank); returning is feedback, not a bare verdict.
templateReviewRoute.patch('/:id/return', requireAdmin, async (c) => {
  const id = c.req.param('id')
  if (!ObjectId.isValid(id)) return c.json({ error: 'Invalid template id' }, 400)

  const col = getDb().collection<Template>('templates')
  const template = await col.findOne({ _id: new ObjectId(id) })
  if (!template) return c.json({ error: 'Template not found' }, 404)

  if (template.status === 'approved' && template.pending_channels) {
    return c.json(await discardPendingEdit(id))
  }

  const body = await c.req.json().catch(() => ({}))
  const parsed = returnTemplateSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const now = new Date()
  const fields = returnFields(c.get('user')._id, parsed.data.remarks, now)
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...fields, updated_at: now } },
    { returnDocument: 'after' }
  )

  if (!result) return c.json({ error: 'Template not found' }, 404)
  return c.json(result)
})
