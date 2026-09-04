import { ObjectId } from 'mongodb'
import type { Role } from '../models/user.js'

// The minimal identity the access helpers need. Matches what dashboardAuth
// attaches to the request context.
export interface AccessUser {
  _id: ObjectId
  role: Role
  project_ids: ObjectId[]
}

const isAdmin = (user: AccessUser) => user.role === 'admin'

/**
 * Project ids this user may access. `null` means UNRESTRICTED (admin) — callers
 * should skip filtering entirely. Otherwise the exact set from the user's own
 * project_ids field.
 */
export function allowedProjectIds(user: AccessUser): ObjectId[] | null {
  if (isAdmin(user)) return null
  return user.project_ids
}

/**
 * Whether the user may touch a specific project. Admins always may; everyone
 * else needs the project in their project_ids. `projectId` must already be a
 * valid ObjectId string.
 */
export function hasProjectAccess(user: AccessUser, projectId: string): boolean {
  if (isAdmin(user)) return true
  return user.project_ids.some((id) => id.equals(projectId))
}
