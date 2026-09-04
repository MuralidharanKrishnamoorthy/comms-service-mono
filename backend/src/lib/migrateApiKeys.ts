import { getDb } from '../db.js'
import { encryptSecret } from './crypto.js'
import { keyPrefix } from './apiKey.js'
import type { Project } from '../models/project.js'
import type { ApiKey } from '../models/apiKey.js'
import type { User } from '../models/user.js'

// One-time migration: fold each project's legacy single key (api_key_hash, and
// api_key if it was stored in plaintext) into one row in the api_keys
// collection, owned by a designated admin, then unset the legacy fields.
// Idempotent: skips projects that no longer carry a legacy hash, and never
// duplicates a key that already exists for the same hash.
export async function migrateApiKeys(): Promise<void> {
  const db = getDb()
  const legacy = await db
    .collection<Project>('projects')
    .find({ api_key_hash: { $exists: true } })
    .toArray()
  if (legacy.length === 0) return

  // Owner for migrated keys: the first admin (fallback: any user). If there are
  // no users at all, leave the legacy fields in place and try again next boot.
  const owner =
    (await db.collection<User>('users').findOne({ role: 'admin' }, { sort: { created_at: 1 } })) ??
    (await db.collection<User>('users').findOne({}, { sort: { created_at: 1 } }))
  if (!owner) {
    console.warn('[api-keys] migration deferred — no users exist yet to own migrated keys')
    return
  }

  let migrated = 0
  for (const project of legacy) {
    const hash = project.api_key_hash!
    const existing = await db.collection<ApiKey>('api_keys').findOne({ key_hash: hash })
    if (!existing) {
      const now = new Date()
      const row: ApiKey = {
        project_id: project._id!,
        name: 'Migrated key',
        key_prefix: project.api_key ? keyPrefix(project.api_key) : 'csvc_…',
        key_hash: hash,
        // Only recoverable if the old plaintext was stored; otherwise the value
        // is gone and the owner must generate a fresh key.
        value_encrypted: project.api_key ? encryptSecret(project.api_key) : null,
        created_by: owner._id!,
        status: project.status === 'active' ? 'active' : 'revoked',
        created_at: project.created_at ?? now,
        updated_at: now,
      }
      await db.collection<ApiKey>('api_keys').insertOne(row)
      migrated++
    }
    await db
      .collection<Project>('projects')
      .updateOne({ _id: project._id }, { $unset: { api_key: '', api_key_hash: '' } })
  }

  console.warn(
    `[api-keys] migrated ${migrated} legacy project key(s) into the api_keys collection ` +
      `(owner: ${owner.email}). Legacy fields removed from projects.`
  )
}
