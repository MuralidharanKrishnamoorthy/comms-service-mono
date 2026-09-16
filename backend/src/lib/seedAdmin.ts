import { getDb } from '../db.js'
import { hashPassword } from './password.js'
import type { User } from '../models/user.js'

export async function seedAdmin(): Promise<void> {
  const db = getDb()

  await db
    .collection<User>('users')
    .updateMany({ project_ids: { $exists: false } }, { $set: { project_ids: [] } })

  const count = await db.collection<User>('users').estimatedDocumentCount()
  if (count > 0) return

  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@local.dev').toLowerCase().trim()
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!password) {
    throw new Error(
      'No users exist and SEED_ADMIN_PASSWORD is not set, so no administrator can be created. ' +
        'Set SEED_ADMIN_PASSWORD (and optionally SEED_ADMIN_EMAIL) in backend/.env and start again.'
    )
  }

  const now = new Date()
  await db.collection<User>('users').insertOne({
    name: 'Administrator',
    email,
    password_hash: hashPassword(password),
    role: 'admin',
    status: 'active',
    project_ids: [],
    must_change_password: true,
    created_at: now,
    updated_at: now,
  })

  console.warn(
    `[auth] No users found — seeded an administrator: ${email}\n` +
      '       The password is the one set in SEED_ADMIN_PASSWORD, and must be changed at first login.'
  )
}
