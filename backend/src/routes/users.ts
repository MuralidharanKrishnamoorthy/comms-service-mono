import { Hono } from 'hono'
import { ObjectId, MongoServerError } from 'mongodb'
import { getDb } from '../db.js'
import { hashPassword } from '../lib/password.js'
import { dashboardAuth, requireAdmin, type AuthEnv } from '../middleware/dashboardAuth.js'
import { createUserSchema, updateUserSchema, type User } from '../models/user.js'

// Mounted at /users — all admin-only. dashboardAuth + requireAdmin are applied
// here so the guarantees travel with the route regardless of mount order.
export const usersRoute = new Hono<AuthEnv>()
usersRoute.use('*', dashboardAuth)
usersRoute.use('*', requireAdmin)

// Shape returned to the client — NEVER includes password_hash.
function safeUser(user: User) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    project_ids: user.project_ids.map((id) => id.toString()),
    created_at: user.created_at,
    updated_at: user.updated_at,
  }
}

// Resolve what to store in User.project_ids for a create/update. Admins always
// end up with none — their access is implicit and unrestricted.
function resolveProjectIds(role: string, projectIds: string[] | undefined): ObjectId[] | undefined {
  if (role === 'admin') return []
  if (!projectIds) return undefined // undefined = leave as-is
  return projectIds.map((pid) => new ObjectId(pid))
}

// POST /users — create a user (admin sets the password).
usersRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const db = getDb()
  const now = new Date()
  const user: User = {
    name: parsed.data.name.trim(),
    email: parsed.data.email.toLowerCase().trim(),
    password_hash: hashPassword(parsed.data.password),
    role: parsed.data.role,
    status: 'active',
    project_ids: resolveProjectIds(parsed.data.role, parsed.data.project_ids) ?? [],
    created_at: now,
    updated_at: now,
  }

  let insertedId: ObjectId
  try {
    const result = await db.collection<User>('users').insertOne(user)
    insertedId = result.insertedId
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      return c.json({ error: 'A user with this email already exists', details: { fieldErrors: { email: ['A user with this email already exists'] } } }, 400)
    }
    throw err
  }

  return c.json(safeUser({ ...user, _id: insertedId }), 201)
})

// GET /users — list users (never password material).
usersRoute.get('/', async (c) => {
  const users = await getDb().collection<User>('users').find({}).sort({ created_at: 1 }).toArray()
  return c.json(users.map(safeUser))
})

// PATCH /users/:id — update name/email/role/status, optional password reset,
// optional membership replacement.
usersRoute.patch('/:id', async (c) => {
  const id = c.req.param('id')
  if (!ObjectId.isValid(id)) return c.json({ error: 'Invalid user id' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const db = getDb()
  const _id = new ObjectId(id)
  const existing = await db.collection<User>('users').findOne({ _id })
  if (!existing) return c.json({ error: 'User not found' }, 404)

  const set: Partial<User> = { updated_at: new Date() }
  if (parsed.data.name !== undefined) set.name = parsed.data.name.trim()
  if (parsed.data.email !== undefined) set.email = parsed.data.email.toLowerCase().trim()
  if (parsed.data.role !== undefined) set.role = parsed.data.role
  if (parsed.data.status !== undefined) set.status = parsed.data.status
  // password PRESENT = reset the hash; OMITTED = leave the existing one untouched.
  if (parsed.data.password !== undefined) set.password_hash = hashPassword(parsed.data.password)

  const effectiveRole = parsed.data.role ?? existing.role
  const projectIds = resolveProjectIds(effectiveRole, parsed.data.project_ids)
  if (projectIds !== undefined) set.project_ids = projectIds

  try {
    await db.collection<User>('users').updateOne({ _id }, { $set: set })
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      return c.json({ error: 'A user with this email already exists', details: { fieldErrors: { email: ['A user with this email already exists'] } } }, 400)
    }
    throw err
  }

  const updated = await db.collection<User>('users').findOne({ _id })
  return c.json(safeUser(updated!))
})
