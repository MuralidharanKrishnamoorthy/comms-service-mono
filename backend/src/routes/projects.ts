import { Hono } from 'hono'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { generateApiKey } from '../lib/apiKey.js'
import { createProjectSchema, type Project } from '../models/project.js'
import type { AuthEnv } from '../middleware/dashboardAuth.js'
import { allowedProjectIds, hasProjectAccess } from '../lib/access.js'

export const projectsRoute = new Hono<AuthEnv>()

// Create a project. Admin only. The plaintext key is stored (product decision —
// retrievable from the project detail screen) alongside its hash, which remains
// the value actually checked on every authenticated request.
projectsRoute.post('/', async (c) => {
  if (c.get('user').role !== 'admin') {
    return c.json({ error: 'Only admins can create projects' }, 403)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = createProjectSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const { plaintext, prefix, hash } = generateApiKey()

  const project: Project = {
    name: parsed.data.name,
    api_key: plaintext,
    api_key_hash: hash,
    api_key_prefix: prefix,
    channels_allowed: ['email', 'sms', 'push'],
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
  }

  const db = getDb()
  const result = await db.collection<Project>('projects').insertOne(project)

  return c.json(
    {
      id: result.insertedId,
      name: project.name,
      api_key: plaintext,
    },
    201
  )
})

// List projects — for the projects table. Never returns the key or its hash,
// only the prefix, so a casual glance at the list can't leak a usable key.
// Scoped: a non-admin sees only the projects they're a member of.
projectsRoute.get('/', async (c) => {
  const db = getDb()
  const allowed = await allowedProjectIds(c.get('user'))
  const filter = allowed === null ? {} : { _id: { $in: allowed } }

  const projects = await db
    .collection<Project>('projects')
    .find(filter, { projection: { api_key_hash: 0, api_key: 0 } })
    .toArray()

  return c.json(projects)
})

// Get one project — the only place the full plaintext key is returned after
// creation. Used by the project detail screen's "copy key" control.
projectsRoute.get('/:projectId', async (c) => {
  const projectId = c.req.param('projectId')
  if (!projectId || !ObjectId.isValid(projectId)) {
    return c.json({ error: 'Invalid projectId' }, 400)
  }
  if (!(await hasProjectAccess(c.get('user'), projectId))) {
    return c.json({ error: 'You do not have access to this project' }, 403)
  }

  const db = getDb()
  const project = await db
    .collection<Project>('projects')
    .findOne({ _id: new ObjectId(projectId) }, { projection: { api_key_hash: 0 } })

  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json(project)
})
