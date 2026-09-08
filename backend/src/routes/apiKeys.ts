import { Hono } from 'hono'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { hasProjectAccess } from '../lib/access.js'
import { generateApiKey, keyPrefix } from '../lib/apiKey.js'
import { encryptSecret, decryptSecret } from '../lib/crypto.js'
import type { AuthEnv } from '../middleware/dashboardAuth.js'
import { createApiKeySchema, DEFAULT_EXPIRY_DAYS, type ApiKey } from '../models/apiKey.js'
import type { User } from '../models/user.js'

const DAY_MS = 24 * 60 * 60 * 1000

function effectiveStatus(key: Pick<ApiKey, 'status' | 'expires_at'>): 'active' | 'revoked' | 'expired' {
  if (key.status === 'revoked') return 'revoked'
  if (key.expires_at && key.expires_at <= new Date()) return 'expired'
  return 'active'
}

export const apiKeysRoute = new Hono<AuthEnv>()

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
  const expiresInDays = parsed.data.expires_in_days ?? DEFAULT_EXPIRY_DAYS
  const key: ApiKey = {
    project_id: new ObjectId(projectId),
    name: parsed.data.name.trim(),
    key_prefix: keyPrefix(plaintext),
    key_hash: hash,
    value_encrypted: encryptSecret(plaintext),
    created_by: user._id,
    status: 'active',
    expires_at: new Date(now.getTime() + expiresInDays * DAY_MS),
    created_at: now,
    updated_at: now,
  }
  const result = await getDb().collection<ApiKey>('api_keys').insertOne(key)

  return c.json(
    {
      id: result.insertedId,
      name: key.name,
      prefix: key.key_prefix,
      created_at: key.created_at,
      expires_at: key.expires_at,
      status: effectiveStatus(key),
      value: plaintext,
    },
    201
  )
})

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
      expires_at: k.expires_at,
      status: effectiveStatus(k),
    }))
  )
})

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

  if (!key.created_by.equals(user._id)) {
    return c.json({ error: 'Only the key owner can reveal its value' }, 403)
  }
  if (!key.value_encrypted) {
    return c.json({ error: 'This key has no retrievable value' }, 409)
  }
  if (!revealAllowed(user._id.toString())) {
    return c.json({ error: 'Too many reveal requests — try again shortly' }, 429)
  }

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

// DELETE /projects/:projectId/api-keys/:keyId — creator OR admin. Removes the
// row outright, unlike revoke which keeps it as a record that the key existed.
//
// Any key can be deleted, active included (product decision). Deleting a live
// key takes effect immediately and whatever is using it starts failing with
// "Invalid API key" rather than the clearer "has been revoked" — the dashboard
// spells that out in its confirmation instead of the API refusing.
apiKeysRoute.delete('/:keyId', async (c) => {
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
    return c.json({ error: 'Only the key owner or an admin can delete this key' }, 403)
  }

  await db.collection<ApiKey>('api_keys').deleteOne({ _id: key._id })

  return c.json({ deleted: true })
})
