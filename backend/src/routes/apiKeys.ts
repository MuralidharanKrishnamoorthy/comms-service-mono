import { Hono } from 'hono'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { hasProjectAccess } from '../lib/access.js'
import { generateApiKey, keyPrefix } from '../lib/apiKey.js'
import { encryptSecret, decryptSecret } from '../lib/crypto.js'
import type { AuthEnv } from '../middleware/dashboardAuth.js'
import { createApiKeySchema, type ApiKey } from '../models/apiKey.js'
import type { User } from '../models/user.js'

// Mounted at /projects/:projectId/api-keys — behind dashboardAuth. Per-project,
// multi-owner keys: anyone with access to the project may create keys; each key
// is owned by its creator. See rules below on each handler.
export const apiKeysRoute = new Hono<AuthEnv>()

// Lightweight in-memory throttle for the reveal endpoint (per user). Not a
// substitute for a real rate limiter, but caps runaway credential-dumping.
const revealHits = new Map<string, number[]>()
const REVEAL_WINDOW_MS = 60_000
const REVEAL_MAX = 30
function revealAllowed(userId: string): boolean {
  const now = Date.now()
  const hits = (revealHits.get(userId) ?? []).filter((t) => now - t < REVEAL_WINDOW_MS)
  if (hits.length >= REVEAL_MAX) {
    revealHits.set(userId, hits)
    return false
  }
  hits.push(now)
  revealHits.set(userId, hits)
  return true
}

// POST /projects/:projectId/api-keys — any project member (not admin-only).
apiKeysRoute.post('/', async (c) => {
  const projectId = c.req.param('projectId')
  if (!projectId || !ObjectId.isValid(projectId)) return c.json({ error: 'Invalid projectId' }, 400)
  const user = c.get('user')
  if (!hasProjectAccess(user, projectId)) {
    return c.json({ error: 'You do not have access to this project' }, 403)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = createApiKeySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const { plaintext, hash } = generateApiKey()
  const now = new Date()
  const key: ApiKey = {
    project_id: new ObjectId(projectId),
    name: parsed.data.name.trim(),
    key_prefix: keyPrefix(plaintext),
    key_hash: hash,
    value_encrypted: encryptSecret(plaintext),
    created_by: user._id,
    status: 'active',
    created_at: now,
    updated_at: now,
  }
  const result = await getDb().collection<ApiKey>('api_keys').insertOne(key)

  // `value` is returned ONLY here at creation (and again later via reveal, to
  // the creator only).
  return c.json(
    {
      id: result.insertedId,
      name: key.name,
      prefix: key.key_prefix,
      created_at: key.created_at,
      status: key.status,
      value: plaintext,
    },
    201
  )
})

// GET /projects/:projectId/api-keys — admin sees all keys' metadata; everyone
// else sees only keys they created. Filtering happens in the query, never in JS.
apiKeysRoute.get('/', async (c) => {
  const projectId = c.req.param('projectId')
  if (!projectId || !ObjectId.isValid(projectId)) return c.json({ error: 'Invalid projectId' }, 400)
  const user = c.get('user')
  if (!hasProjectAccess(user, projectId)) {
    return c.json({ error: 'You do not have access to this project' }, 403)
  }

  const db = getDb()
  const filter: Record<string, unknown> = { project_id: new ObjectId(projectId) }
  if (user.role !== 'admin') filter.created_by = user._id

  const keys = await db
    .collection<ApiKey>('api_keys')
    // Never project value_encrypted or key_hash into a list response.
    .find(filter, { projection: { value_encrypted: 0, key_hash: 0 } })
    .sort({ created_at: -1 })
    .toArray()

  const creatorIds = [...new Set(keys.map((k) => k.created_by.toString()))].map((id) => new ObjectId(id))
  const creators = await db
    .collection<User>('users')
    .find({ _id: { $in: creatorIds } }, { projection: { name: 1, email: 1 } })
    .toArray()
  const nameById = new Map(creators.map((u) => [u._id!.toString(), u.name]))

  return c.json(
    keys.map((k) => ({
      _id: k._id,
      name: k.name,
      prefix: k.key_prefix,
      created_by: k.created_by.toString(),
      created_by_name: nameById.get(k.created_by.toString()) ?? 'Unknown',
      created_at: k.created_at,
      status: k.status,
    }))
  )
})

// GET /projects/:projectId/api-keys/:keyId/reveal — CREATOR ONLY. No admin
// bypass: admins can revoke, not read. Every call is audit-logged.
apiKeysRoute.get('/:keyId/reveal', async (c) => {
  const projectId = c.req.param('projectId')
  const keyId = c.req.param('keyId')
  if (!projectId || !ObjectId.isValid(projectId)) return c.json({ error: 'Invalid projectId' }, 400)
  if (!keyId || !ObjectId.isValid(keyId)) return c.json({ error: 'Invalid keyId' }, 400)
  const user = c.get('user')
  if (!hasProjectAccess(user, projectId)) {
    return c.json({ error: 'You do not have access to this project' }, 403)
  }

  const db = getDb()
  const key = await db
    .collection<ApiKey>('api_keys')
    .findOne({ _id: new ObjectId(keyId), project_id: new ObjectId(projectId) })
  if (!key) return c.json({ error: 'Key not found' }, 404)

  // Only the creator — deliberately no admin bypass on this endpoint.
  if (!key.created_by.equals(user._id)) {
    return c.json({ error: 'Only the key owner can reveal its value' }, 403)
  }
  if (!key.value_encrypted) {
    return c.json({ error: 'This key has no retrievable value' }, 409)
  }
  if (!revealAllowed(user._id.toString())) {
    return c.json({ error: 'Too many reveal requests — try again shortly' }, 429)
  }

  // Each reveal is a live credential exposure event — trace it to the server
  // log. (No dedicated audit collection: console-only by choice.)
  console.info(
    `[api-keys] reveal: user=${user._id.toString()} key=${key._id!.toString()} project=${projectId} at=${new Date().toISOString()}`
  )

  return c.json({ value: decryptSecret(key.value_encrypted) })
})

// POST /projects/:projectId/api-keys/:keyId/revoke — creator OR admin.
apiKeysRoute.post('/:keyId/revoke', async (c) => {
  const projectId = c.req.param('projectId')
  const keyId = c.req.param('keyId')
  if (!projectId || !ObjectId.isValid(projectId)) return c.json({ error: 'Invalid projectId' }, 400)
  if (!keyId || !ObjectId.isValid(keyId)) return c.json({ error: 'Invalid keyId' }, 400)
  const user = c.get('user')
  if (!hasProjectAccess(user, projectId)) {
    return c.json({ error: 'You do not have access to this project' }, 403)
  }

  const db = getDb()
  const key = await db
    .collection<ApiKey>('api_keys')
    .findOne({ _id: new ObjectId(keyId), project_id: new ObjectId(projectId) })
  if (!key) return c.json({ error: 'Key not found' }, 404)

  if (user.role !== 'admin' && !key.created_by.equals(user._id)) {
    return c.json({ error: 'Only the key owner or an admin can revoke this key' }, 403)
  }

  await db
    .collection<ApiKey>('api_keys')
    .updateOne({ _id: key._id }, { $set: { status: 'revoked', updated_at: new Date() } })

  return c.json({ id: key._id, status: 'revoked' })
})
