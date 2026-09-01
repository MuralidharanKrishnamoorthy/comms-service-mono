import { z } from 'zod'
import type { ObjectId } from 'mongodb'

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
})

export type Channel = 'email' | 'sms' | 'push'

export interface Project {
  _id?: ObjectId
  name: string
  api_key_hash: string
  api_key_prefix: string
  channels_allowed: Channel[]
  status: 'active' | 'disabled'
  created_at: Date
  updated_at: Date
}
