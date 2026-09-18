import { Hono } from 'hono'
import { ObjectId, MongoServerError } from 'mongodb'
import { getDb } from '../db.js'
import {
  createTemplateSchema,
  updateChannelContentSchema,
  normalizeTemplateKey,
  TEMPLATE_STATUS_FILTERS,
  type Template,
  type ChannelContent,
  type TemplateStatusFilter,
} from '../models/template.js'
import type { AuthEnv } from '../middleware/dashboardAuth.js'
import { hasProjectAccess } from '../lib/access.js'
import { parsePageParams, paginationMeta, skipFor } from '../lib/pagination.js'
import {
  autoApprovedReviewFields,
  initialReviewFields,
  isEditLocked,
  resetReviewForEdit,
} from '../lib/templateReview.js'
import type { Category } from '../models/category.js'

export const templatesRoute = new Hono<AuthEnv>()

templatesRoute.use('*', async (c, next) => {
  const projectId = c.req.param('projectId')

  if (!projectId || !ObjectId.isValid(projectId)) {
    return c.json({ error: 'Invalid projectId' }, 400)
  }
  if (!hasProjectAccess(c.get('user'), projectId)) {
    return c.json({ error: 'You do not have access to this project' }, 403)
  }

  await next()
})

function withVersionAndLive(content: Omit<ChannelContent, 'version' | 'live'>): ChannelContent {
  return { ...content, version: 1, live: true }
}

function nextChannelContent(
  existing: ChannelContent | undefined,
  patch: Partial<Omit<ChannelContent, 'version' | 'live'>>
): ChannelContent {
  return {
    ...existing,
    ...patch,
    variables: patch.variables ?? existing?.variables ?? [],
    version: (existing?.version ?? 0) + 1,
    live: true,
  }
}

templatesRoute.post('/', async (c) => {
  const projectId = c.req.param('projectId')!

  const body = await c.req.json().catch(() => null)
  const parsed = createTemplateSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const db = getDb()

  const existing = await db.collection<Template>('templates').findOne({
    project_id: new ObjectId(projectId),
    template_key: parsed.data.template_key,
  })
  if (existing) {
    return c.json({ error: `template_key "${parsed.data.template_key}" already exists for this project` }, 409)
  }

  // An admin's own template is trusted and born approved; everyone else's starts
  // pending, awaiting an admin's review. Either way the status/review fields are
  // set here from the caller's role, never taken from the request body.
  const user = c.get('user')
  const now = new Date()
  const reviewFields =
    user.role === 'admin' ? autoApprovedReviewFields(user._id, now) : initialReviewFields()

  const template: Template = {
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
  }

  try {
    const result = await db.collection<Template>('templates').insertOne(template)
    return c.json({ id: result.insertedId, ...template }, 201)
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      return c.json({ error: `template_key "${parsed.data.template_key}" already exists for this project` }, 409)
    }
    throw err
  }
})

templatesRoute.get('/', async (c) => {
  const projectId = c.req.param('projectId')!

  const query: Record<string, unknown> = { project_id: new ObjectId(projectId) }

  // Templates belong to the project, not to whoever typed them: everyone on the
  // project sees the same list, the same way they see each other's categories.
  // Membership is already enforced by the middleware above, and `created_by` is
  // kept for attribution and for the review flow rather than for visibility.
  //
  // Optionally narrowed by review status (?status=pending|approved|rejected);
  // absent or "all" means no filter.
  const raw = c.req.query('status')
  if (raw && raw !== 'all') {
    if (!TEMPLATE_STATUS_FILTERS.includes(raw as TemplateStatusFilter)) {
      return c.json({ error: `status must be one of: ${TEMPLATE_STATUS_FILTERS.join(', ')}` }, 400)
    }
    query.status = raw
  }

  // Pagination is applied AFTER the filters above, so totalItems counts only the
  // filtered set and the page is a window into it.
  const { page, limit } = parsePageParams(c.req.query('page'), c.req.query('limit'))
  const db = getDb()
  const col = db.collection<Template>('templates')
  const totalItems = await col.countDocuments(query)
  const templates = await col
    .find(query)
    .sort({ updated_at: -1 })
    .skip(skipFor(page, limit))
    .limit(limit)
    .toArray()

  return c.json({ data: templates, pagination: paginationMeta(page, limit, totalItems) })
})

templatesRoute.get('/:templateKey', async (c) => {
  const projectId = c.req.param('projectId')!
  const templateKey = normalizeTemplateKey(c.req.param('templateKey') ?? '')

  const db = getDb()
  const template = await db.collection<Template>('templates').findOne({
    project_id: new ObjectId(projectId),
    template_key: templateKey,
  })

  if (!template) {
    return c.json({ error: 'Template not found' }, 404)
  }

  return c.json(template)
})

templatesRoute.patch('/:templateKey/:channel', async (c) => {
  const projectId = c.req.param('projectId')!
  const templateKey = normalizeTemplateKey(c.req.param('templateKey') ?? '')
  const channel = c.req.param('channel')

  if (channel !== 'email' && channel !== 'sms' && channel !== 'push') {
    return c.json({ error: 'channel must be one of: email, sms, push' }, 400)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = updateChannelContentSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const col = getDb().collection<Template>('templates')
  const template = await col.findOne({
    project_id: new ObjectId(projectId),
    template_key: templateKey,
  })
  if (!template) {
    return c.json({ error: 'Template not found' }, 404)
  }

  // A rejected template is locked — refuse before touching anything, whatever
  // fields the request carries. The author must create a new template instead;
  // only an admin reopen (a separate action) could move it out of "rejected".
  if (isEditLocked(template.status)) {
    return c.json(
      { error: 'This template was rejected and is locked. Create a new template instead.' },
      409
    )
  }

  const now = new Date()

  // An approved template is already live — its content must not change under
  // it, so the edit is staged in `pending_channels` instead of `channels`.
  // Only approving or rejecting the edit (routes/templateReview.ts) touches
  // `channels` from here on.
  if (template.status === 'approved') {
    const base = template.pending_channels ?? template.channels
    const pendingChannels = { ...base, [channel]: nextChannelContent(base[channel], parsed.data) }

    await col.updateOne(
      { project_id: new ObjectId(projectId), template_key: templateKey },
      { $set: { pending_channels: pendingChannels, updated_at: now } }
    )

    return c.json({ ...template, pending_channels: pendingChannels, updated_at: now })
  }

  const updatedChannel = nextChannelContent(template.channels[channel], parsed.data)

  // Any content change invalidates a prior review: a returned template drops
  // back to "pending" and its audit fields clear. An already-pending template
  // is left as it is (resetReviewForEdit returns null).
  const reviewReset = resetReviewForEdit(template.status)

  await col.updateOne(
    { project_id: new ObjectId(projectId), template_key: templateKey },
    { $set: { [`channels.${channel}`]: updatedChannel, updated_at: now, ...(reviewReset ?? {}) } }
  )

  return c.json({
    ...template,
    channels: { ...template.channels, [channel]: updatedChannel },
    ...(reviewReset ?? {}),
  })
})

// Delete a template. Cascades: pulls it out of every category's `templates`
// array, matched by template_id — the real foreign key, immune to a
// template_key ever being reused. No such reuse is possible today (template_key
// is immutable), but the cascade means a category can never end up pointing at
// a template that no longer exists.
templatesRoute.delete('/:templateKey', async (c) => {
  const projectId = c.req.param('projectId')!
  const templateKey = normalizeTemplateKey(c.req.param('templateKey') ?? '')

  const db = getDb()
  const template = await db.collection<Template>('templates').findOne({
    project_id: new ObjectId(projectId),
    template_key: templateKey,
  })
  if (!template) {
    return c.json({ error: 'Template not found' }, 404)
  }

  // A category is reachable only through the projects of its templates, so one
  // that would be left empty belongs to no project: invisible to every member
  // and deletable by none. Rather than quietly destroying a named grouping as
  // a side effect, say which categories would go and make the caller ask again
  // with ?delete_orphaned_categories=true.
  const orphaned = await db
    .collection<Category>('categories')
    .find({ 'templates.template_id': template._id, templates: { $size: 1 } }, { projection: { name: 1 } })
    .toArray()

  const confirmed = c.req.query('delete_orphaned_categories') === 'true'
  if (orphaned.length > 0 && !confirmed) {
    const names = orphaned.map((cat) => `"${cat.name}"`).join(', ')
    return c.json(
      {
        error:
          `"${template.template_key}" is the only template in ${names}. ` +
          `Deleting it would leave ${orphaned.length === 1 ? 'that category' : 'those categories'} empty, ` +
          `so ${orphaned.length === 1 ? 'it' : 'they'} would be removed too. ` +
          'Detach the template first, or repeat this request with ?delete_orphaned_categories=true.',
        orphaned_categories: orphaned.map((cat) => ({ _id: cat._id, name: cat.name })),
      },
      409
    )
  }

  await db.collection<Template>('templates').deleteOne({ _id: template._id })
  await db
    .collection<Category>('categories')
    .updateMany({ 'templates.template_id': template._id }, { $pull: { templates: { template_id: template._id } } })

  // Exactly the categories identified above — a targeted delete, so a category
  // left empty by some other route is never swept up by this one.
  if (orphaned.length > 0) {
    await db
      .collection<Category>('categories')
      .deleteMany({ _id: { $in: orphaned.map((cat) => cat._id!) } })
  }

  return c.json({
    deleted: true,
    categories_removed: orphaned.map((cat) => ({ _id: cat._id, name: cat.name })),
  })
})
