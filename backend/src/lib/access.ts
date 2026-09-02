import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import type { ProjectMember } from '../models/membership.js'
import type { Role } from '../models/user.js'

// The minimal identity the access helpers need. Matches what dashboardAuth
// attaches to the request context.
export interface AccessUser {
  _id: ObjectId
  role: Role
}

const isAdmin = (user: AccessUser) => user.role === 'admin'

/**
 * Project ids this user may access. `null` means UNRESTRICTED (admin) — callers
 * should skip filtering entirely. Otherwise the exact set from the user's
 * project_members rows.
 */
export async function allowedProjectIds(user: AccessUser): Promise<ObjectId[] | null> {
  if (isAdmin(user)) return null
  const rows = await getDb()
    .collection<ProjectMember>('project_members')
    .find({ user_id: user._id }, { projection: { project_id: 1 } })
    .toArray()
  return rows.map((r) => r.project_id)
}

/**
 * Whether the user may touch a specific project. Admins always may; everyone
 * else needs a membership row. `projectId` must already be a valid ObjectId string.
 */
export async function hasProjectAccess(user: AccessUser, projectId: string): Promise<boolean> {
  if (isAdmin(user)) return true
  const row = await getDb()
    .collection<ProjectMember>('project_members')
    .findOne({ user_id: user._id, project_id: new ObjectId(projectId) })
  return row !== null
}
