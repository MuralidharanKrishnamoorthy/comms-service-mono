import { z } from 'zod'
import type { ObjectId } from 'mongodb'

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
})

export type Channel = 'email' | 'sms' | 'push'

export interface Project {
  _id?: ObjectId
  name: string
  // Stored in plaintext by explicit product decision, for retrieval from the
  // project detail screen. api_key_hash remains the source of truth used for
  // authenticating incoming requests — this field exists only for display.
  api_key: string
  api_key_hash: string
  channels_allowed: Channel[]
  status: 'active' | 'disabled'
  created_at: Date
  updated_at: Date
}
