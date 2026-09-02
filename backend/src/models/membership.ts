import type { ObjectId } from 'mongodb'

// Join table linking a user to a project they may access. A non-admin user sees
// exactly the projects they have a row for here; no row = no access.
export interface ProjectMember {
  _id?: ObjectId
  user_id: ObjectId
  project_id: ObjectId
  // Reserved for a future read-only vs edit distinction. Not enforced yet —
  // membership alone grants full access to the project in this pass.
  role_in_project: 'editor' | 'viewer'
  created_at: Date
}
