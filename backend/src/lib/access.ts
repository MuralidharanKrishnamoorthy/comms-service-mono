import { ObjectId } from 'mongodb'
import type { Role } from '../models/user.js'

export interface AccessUser {
  _id: ObjectId
  role: Role
  project_ids: ObjectId[]
}

const isAdmin = (user: AccessUser) => user.role === 'admin'

export function allowedProjectIds(user: AccessUser): ObjectId[] | null {
  if (isAdmin(user)) return null
  return user.project_ids
}

export function hasProjectAccess(user: AccessUser, projectId: string): boolean {
  if (isAdmin(user)) return true
  return user.project_ids.some((id) => id.equals(projectId))
}
