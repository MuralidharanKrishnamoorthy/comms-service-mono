import { Hono } from 'hono'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { dashboardAuth, requireAdmin, type AuthEnv } from '../middleware/dashboardAuth.js'
import type { User } from '../models/user.js'
import type { Project } from '../models/project.js'

// Mounted at /projects/:projectId/members — admin-only management of who can
// access a single project. (User-centric membership editing also happens via
// PATCH /users/:id with project_ids; this is the project-centric view.) Access
// is stored on the user document itself (User.project_ids), not a join table.
export const membersRoute = new Hono<AuthEnv>()
membersRoute.use('*', dashboardAuth)
membersRoute.use('*', requireAdmin)

// GET /projects/:projectId/members — users who can access this project.
membersRoute.get('/', async (c) => {
  const projectId = c.req.param('projectId')
  if (!projectId || !ObjectId.isValid(projectId)) return c.json({ error: 'Invalid projectId' }, 400)

  const users = await getDb()
    .collection<User>('users')
    .find({ project_ids: new ObjectId(projectId) })
    .toArray()

  return c.json(
    users.map((u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role, status: u.status }))
  )
})

// POST /projects/:projectId/members  { user_id }
membersRoute.post('/', async (c) => {
  const projectId = c.req.param('projectId')
  if (!projectId || !ObjectId.isValid(projectId)) return c.json({ error: 'Invalid projectId' }, 400)

  const body = await c.req.json().catch(() => null)
  const userId = body?.user_id
  if (typeof userId !== 'string' || !ObjectId.isValid(userId)) {
    return c.json({ error: 'A valid user_id is required' }, 400)
  }

  const db = getDb()
  const [project, user] = await Promise.all([
    db.collection<Project>('projects').findOne({ _id: new ObjectId(projectId) }),
    db.collection<User>('users').findOne({ _id: new ObjectId(userId) }),
  ])
  if (!project) return c.json({ error: 'Project not found' }, 404)
  if (!user) return c.json({ error: 'User not found' }, 404)
  if (user.role === 'admin') {
    return c.json({ error: 'Admins already have access to every project' }, 400)
  }

  await db
    .collection<User>('users')
    .updateOne({ _id: user._id }, { $addToSet: { project_ids: new ObjectId(projectId) }, $set: { updated_at: new Date() } })

  return c.json({ added: true }, 201)
})

// DELETE /projects/:projectId/members/:userId
membersRoute.delete('/:userId', async (c) => {
  const projectId = c.req.param('projectId')
  const userId = c.req.param('userId')
  if (!projectId || !ObjectId.isValid(projectId)) return c.json({ error: 'Invalid projectId' }, 400)
  if (!userId || !ObjectId.isValid(userId)) return c.json({ error: 'Invalid userId' }, 400)

  await getDb()
    .collection<User>('users')
    .updateOne(
      { _id: new ObjectId(userId) },
      { $pull: { project_ids: new ObjectId(projectId) }, $set: { updated_at: new Date() } }
    )

  return c.json({ removed: true })
})
