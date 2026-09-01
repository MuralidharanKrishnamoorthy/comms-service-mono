// Shapes mirror what the backend actually returns. See backend/src/routes/*.

export type Channel = 'email' | 'sms' | 'push'
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'failed'

export interface Project {
  _id: string
  name: string
  api_key_prefix: string
  channels_allowed: Channel[]
  status: string
  created_at: string
  updated_at: string
}

// Returned exactly once by POST /projects.
export interface CreatedProject {
  id: string
  name: string
  api_key: string
}

export interface ChannelContent {
  subject?: string
  html_body?: string
  title?: string
  body?: string
  variables: string[]
  version: number
  live: boolean
}

export interface Template {
  _id: string
  project_id: string
  category: string
  template_key: string
  name: string
  channels: Partial<Record<Channel, ChannelContent>>
  created_at: string
  updated_at: string
}

export interface MessageLog {
  _id: string
  project_id: string
  category: string
  template_id: string
  template_key: string
  channel: Channel
  recipient: string
  data: Record<string, unknown>
  status: MessageStatus
  attempts: number
  provider_message_id?: string
  created_at: string
  updated_at: string
}

// Backend 400 error envelope: { error, details: { fieldErrors, formErrors } }
export interface ApiErrorDetails {
  formErrors?: string[]
  fieldErrors?: Record<string, string[]>
}
