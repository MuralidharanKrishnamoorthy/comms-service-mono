import { Hono } from 'hono'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import type { MessageLog } from '../models/messageLog.js'
import type { Category } from '../models/category.js'
import type { AuthEnv } from '../middleware/dashboardAuth.js'
import { allowedProjectIds, hasProjectAccess } from '../lib/access.js'
import { parsePageParams, paginationMeta, skipFor } from '../lib/pagination.js'

export const messageLogsRoute = new Hono<AuthEnv>()

// Cross-project, paginated logs feed for the Notification Logs page. Project is
// just one optional filter here (alongside status, channel and category), so a
// single query can page across every project the caller may see — which the old
// per-project endpoint below cannot do. Filters are applied FIRST, then the
// page window, so totalItems reflects the filtered set.
export const logsRoute = new Hono<AuthEnv>()

logsRoute.get('/', async (c) => {
  const user = c.get('user')
  const db = getDb()

  const { page, limit } = parsePageParams(c.req.query('page'), c.req.query('limit'))
  const status = c.req.query('status')
  const channel = c.req.query('channel')
  const projectParam = c.req.query('project')
  const categoryId = c.req.query('category')

  const filter: Record<string, unknown> = {}

  // Project scope: admins see every project (allowed === null); everyone else is
  // confined to their own project_ids. An explicit ?project narrows further, and
  // is refused if the caller can't see it.
  const allowed = allowedProjectIds(user)
  let projectScope: ObjectId | null = null
  if (projectParam) {
    if (!ObjectId.isValid(projectParam)) return c.json({ error: 'Invalid project' }, 400)
    if (!hasProjectAccess(user, projectParam)) {
      return c.json({ error: 'You do not have access to this project' }, 403)
    }
    projectScope = new ObjectId(projectParam)
    filter.project_id = projectScope
  } else if (allowed) {
    filter.project_id = { $in: allowed }
  }

  if (status) filter.status = status
  if (channel) filter.channel = channel

  // Category filter: restrict to the (project_id, template_key) pairs the
  // category attaches, resolved server-side so the page count reflects only
  // matching logs. Pairs outside the caller's project scope are dropped; a
  // category with no in-scope pairs yields an empty page.
  if (categoryId) {
    if (!ObjectId.isValid(categoryId)) return c.json({ error: 'Invalid category' }, 400)
    const category = await db
      .collection<Category>('categories')
      .findOne({ _id: new ObjectId(categoryId) })

    const inScope = (pid: ObjectId) =>
      projectScope ? pid.equals(projectScope) : !allowed || allowed.some((id) => id.equals(pid))

    const pairs = (category?.templates ?? [])
      .filter((t) => inScope(t.project_id))
      .map((t) => ({ project_id: t.project_id, template_key: t.template_key }))

    if (pairs.length === 0) {
      return c.json({ data: [], pagination: paginationMeta(page, limit, 0) })
    }
    filter.$or = pairs
  }

  const col = db.collection<MessageLog>('message_logs')
  const totalItems = await col.countDocuments(filter)
  const data = await col
    .find(filter)
    .sort({ created_at: -1 })
    .skip(skipFor(page, limit))
    .limit(limit)
    .toArray()

  return c.json({ data, pagination: paginationMeta(page, limit, totalItems) })
})

messageLogsRoute.get('/', async (c) => {
  const projectId = c.req.param('projectId')
  if (!projectId || !ObjectId.isValid(projectId)) {
    return c.json({ error: 'Invalid projectId' }, 400)
  }
  if (!(await hasProjectAccess(c.get('user'), projectId))) {
    return c.json({ error: 'You do not have access to this project' }, 403)
  }

  const status = c.req.query('status')
  const channel = c.req.query('channel')
  const templateKey = c.req.query('template_key')

  const filter: Record<string, unknown> = { project_id: new ObjectId(projectId) }
  if (status) filter.status = status
  if (channel) filter.channel = channel
  if (templateKey) filter.template_key = templateKey

  const db = getDb()
  const logs = await db
    .collection<MessageLog>('message_logs')
    .find(filter)
    .sort({ created_at: -1 })
    .limit(200)
    .toArray()

  return c.json(logs)
})
