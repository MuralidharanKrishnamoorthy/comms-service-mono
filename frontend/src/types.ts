export type Channel = 'email' | 'sms' | 'push'
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'failed'

export interface Project {
  _id: string
  name: string
  channels_allowed: Channel[]
  status: string

  active_key_count?: number
  created_at: string
  updated_at: string
}

export interface ApiKeyRow {
  _id: string
  name: string
  prefix: string
  created_by: string
  created_by_name: string
  created_at: string
  expires_at: string | null
  status: 'active' | 'revoked' | 'expired'
}

export interface CreatedApiKey {
  id: string
  name: string
  prefix: string
  created_at: string
  expires_at: string | null
  status: 'active' | 'revoked' | 'expired'
  value: string
}

export interface CreatedProject {
  id: string
  name: string
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
  template_key: string
  name: string
  channels: Partial<Record<Channel, ChannelContent>>
  created_at: string
  updated_at: string
}

export interface AttachedTemplateRow {
  template_id: string
  template_key: string
  name: string
  channels: Template['channels']
  project_id: string
  project_name: string
  attached_at: string
}

export interface CategoryWithAttached {
  category: { _id: string; name: string; created_at: string }
  attached: AttachedTemplateRow[]

  hidden_count: number
}

export interface CategoryTemplateRef {
  project_id: string
  template_id: string
  template_key: string
  created_at: string
}

export interface Category {
  _id: string
  name: string
  templates: CategoryTemplateRef[]
  template_count: number
  created_at: string
}

export interface MessageLog {
  _id: string
  project_id: string
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

export interface ApiErrorDetails {
  formErrors?: string[]
  fieldErrors?: Record<string, string[]>
}

export type Role = 'admin' | 'developer' | 'ba' | 'tester'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: Role

  mustChangePassword: boolean
}

export interface ManagedUser {
  _id: string
  name: string
  email: string
  role: Role
  status: 'active' | 'disabled'
  project_ids: string[]
  created_at: string
  updated_at?: string
}
