import { Hono } from 'hono'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { rejectTemplateSchema, returnTemplateSchema, type Template } from '../models/template.js'
import { requireAdmin, type AuthEnv } from '../middleware/dashboardAuth.js'
import { approvalFields, rejectionFields, returnFields } from '../lib/templateReview.js'

// Review actions on a template by its id, spanning every project — the approval
// decision belongs to an admin regardless of which project the template lives
// in, so these are mounted at /templates rather than under a single project.
export const templateReviewRoute = new Hono<AuthEnv>()

// PATCH /templates/:id/approve  (admin only)
templateReviewRoute.patch('/:id/approve', requireAdmin, async (c) => {
  const id = c.req.param('id')
  if (!ObjectId.isValid(id)) return c.json({ error: 'Invalid template id' }, 400)

  const now = new Date()
  const fields = approvalFields(c.get('user')._id, now)
  const result = await getDb()
    .collection<Template>('templates')
    .findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...fields, updated_at: now } },
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

  const now = new Date()
  const fields = rejectionFields(c.get('user')._id, parsed.data.reason, now)
  const result = await getDb()
    .collection<Template>('templates')
    .findOneAndUpdate(
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

  const body = await c.req.json().catch(() => ({}))
  const parsed = returnTemplateSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const now = new Date()
  const fields = returnFields(c.get('user')._id, parsed.data.remarks, now)
  const result = await getDb()
    .collection<Template>('templates')
    .findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...fields, updated_at: now } },
      { returnDocument: 'after' }
    )

  if (!result) return c.json({ error: 'Template not found' }, 404)
  return c.json(result)
})
