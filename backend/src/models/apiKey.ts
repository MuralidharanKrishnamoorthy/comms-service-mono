import { z } from 'zod'
import type { ObjectId } from 'mongodb'

// One document per API key. A project has many; each has exactly one owner
// (created_by). See routes/apiKeys.ts for the ownership/visibility rules.
export interface ApiKey {
  _id?: ObjectId
  project_id: ObjectId
  name: string
  key_prefix: string // first ~15 chars, plaintext — safe to show to anyone who can list
  key_hash: string // SHA-256, one-way — used ONLY for send-time auth
  // AES-256-GCM ciphertext of the full key, decrypted ONLY by the creator via
  // the reveal endpoint. May be null for keys migrated without a stored value.
  value_encrypted: string | null
  created_by: ObjectId // user _id of the owner
  status: 'active' | 'revoked'
  // Null means "never expires" (only reachable today via a pre-expiry-feature
  // migrated key). Every key created through the API now always gets one.
  expires_at: Date | null
  created_at: Date
  updated_at: Date
}

// Applied when a caller hits the API directly without naming an expiry. The
// dashboard always sends one explicitly — it makes the user choose.
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
