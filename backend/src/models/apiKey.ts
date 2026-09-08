import { z } from 'zod'
import type { ObjectId } from 'mongodb'

export interface ApiKey {
  _id?: ObjectId
  project_id: ObjectId
  name: string
  key_prefix: string
  key_hash: string

  value_encrypted: string | null
  created_by: ObjectId
  status: 'active' | 'revoked'

  expires_at: Date | null
  created_at: Date
  updated_at: Date
}

export const DEFAULT_EXPIRY_DAYS = 90

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'A key name is required').max(80),
  expires_in_days: z
    .number()
    .int()
    .min(1, 'Must expire at least 1 day out')
    .max(365, 'Cannot exceed 365 days')
    .optional(),
})
