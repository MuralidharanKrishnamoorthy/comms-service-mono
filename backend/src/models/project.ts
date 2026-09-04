import { z } from 'zod'
import type { ObjectId } from 'mongodb'

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
})

export type Channel = 'email' | 'sms' | 'push'

export interface Project {
  _id?: ObjectId
  name: string
  // Legacy single-key fields. Keys now live in their own `api_keys` collection
  // (per-project, multi-owner). These remain optional only so the one-time
  // migration can read and then unset them on old documents; new projects never
  // set them. See lib/migrateApiKeys.ts.
  api_key?: string
  api_key_hash?: string
  channels_allowed: Channel[]
  status: 'active' | 'disabled'
  created_at: Date
  updated_at: Date
}
