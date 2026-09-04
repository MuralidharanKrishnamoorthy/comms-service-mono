// Shapes mirror what the backend actually returns. See backend/src/routes/*.

export type Channel = 'email' | 'sms' | 'push'
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'failed'

export interface Project {
  _id: string
  name: string
  // Only present when fetched via getProject() (the detail endpoint) — the
  // list endpoint never includes it.
  api_key?: string
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
  template_key: string
  name: string
  channels: Partial<Record<Channel, ChannelContent>>
  created_at: string
  updated_at: string
}

// A template flagged with whether it's attached to a specific category —
// only present on the per-category template listing.
export interface TemplateWithAttached extends Template {
  attached: boolean
}

export interface Category {
  _id: string
  name: string
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

// Backend 400 error envelope: { error, details: { fieldErrors, formErrors } }
export interface ApiErrorDetails {
  formErrors?: string[]
  fieldErrors?: Record<string, string[]>
}

// ---------- Auth & access ----------
// admin is unrestricted; developer / ba / tester are scoped identically to
// their project memberships and differ only in label/badge colour.
export type Role = 'admin' | 'developer' | 'ba' | 'tester'

// The logged-in user, from GET /auth/me. Never carries password material.
export interface AuthUser {
  id: string
  email: string
  name: string
  role: Role
}

// A user as managed on the admin "Users & Access" screen (GET /users).
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
