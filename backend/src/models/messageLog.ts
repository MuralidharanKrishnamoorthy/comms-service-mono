import type { ObjectId } from 'mongodb'
import type { Channel } from './project.js'

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'failed'
export type { Channel }

export interface MessageLog {
  _id?: ObjectId
  project_id: ObjectId
  template_id: ObjectId
  template_key: string
  channel: Channel
  recipient: string
  data: Record<string, unknown>
  status: MessageStatus
  attempts: number
  next_retry_at?: Date
  provider_message_id?: string
  provider_response?: unknown
  created_at: Date
  updated_at: Date
}
