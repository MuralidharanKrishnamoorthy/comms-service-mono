import type { ObjectId } from 'mongodb'
import type { Channel } from './project.js'

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'failed'
export type { Channel }

// One document per actual send attempt — never written onto the template itself.
// A template is reused across many sends; this is that history.
export interface MessageLog {
  _id?: ObjectId
  project_id: ObjectId
  template_id: ObjectId
  template_key: string
  channel: Channel
  recipient: string
  // The exact variables submitted at send time — kept so a retry can re-render
  // the (still-current) live template without the caller resubmitting anything.
  data: Record<string, unknown>
  status: MessageStatus
  attempts: number
  next_retry_at?: Date
  provider_message_id?: string
  provider_response?: unknown
  created_at: Date
  updated_at: Date
}
