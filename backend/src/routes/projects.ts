import { Hono } from 'hono'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { createProjectSchema, type Project } from '../models/project.js'
import type { ApiKey } from '../models/apiKey.js'
import type { AuthEnv } from '../middleware/dashboardAuth.js'
import { allowedProjectIds, hasProjectAccess } from '../lib/access.js'

export const projectsRoute = new Hono<AuthEnv>()

// Create a project. Admin only. Creating a project no longer mints an API key —
// keys are created separately, per-owner, from the project's API Keys panel.
projectsRoute.post('/', async (c) => {
  if (c.get('user').role !== 'admin') {
    return c.json({ error: 'Only admins can create projects' }, 403)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = createProjectSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const project: Project = {
    name: parsed.data.name,
    channels_allowed: ['email', 'sms', 'push'],
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
  }

  const db = getDb()
  const result = await db.collection<Project>('projects').insertOne(project)

  return c.json({ id: result.insertedId, name: project.name }, 201)
})

// List projects — for the projects table. Scoped: a non-admin sees only the
// projects they're a member of. Each row carries an active-key count that
// respects the same visibility as the keys list (admin: all active keys;
// everyone else: only their own active keys).
projectsRoute.get('/', async (c) => {
  const db = getDb()
  const user = c.get('user')
  const allowed = allowedProjectIds(user)
  const filter = allowed === null ? {} : { _id: { $in: allowed } }

  const projects = await db
    .collection<Project>('projects')
    .find(filter, { projection: { api_key_hash: 0, api_key: 0 } })
    .toArray()

  const keyMatch: Record<string, unknown> = { status: 'active' }
  if (allowed !== null) keyMatch.project_id = { $in: allowed }
  if (user.role !== 'admin') keyMatch.created_by = user._id

  const counts = await db
    .collection<ApiKey>('api_keys')
    .aggregate<{ _id: ObjectId; count: number }>([
      { $match: keyMatch },
      { $group: { _id: '$project_id', count: { $sum: 1 } } },
    ])
    .toArray()
  const countByProject = new Map(counts.map((r) => [r._id.toString(), r.count]))

  return c.json(
    projects.map((p) => ({ ...p, active_key_count: countByProject.get(p._id!.toString()) ?? 0 }))
  )
})

// Get one project (metadata only — no key material lives here anymore).
projectsRoute.get('/:projectId', async (c) => {
  const projectId = c.req.param('projectId')
  if (!projectId || !ObjectId.isValid(projectId)) {
    return c.json({ error: 'Invalid projectId' }, 400)
  }
  if (!hasProjectAccess(c.get('user'), projectId)) {
    return c.json({ error: 'You do not have access to this project' }, 403)
  }

  const db = getDb()
  const project = await db
    .collection<Project>('projects')
    .findOne({ _id: new ObjectId(projectId) }, { projection: { api_key_hash: 0, api_key: 0 } })

  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json(project)
})
