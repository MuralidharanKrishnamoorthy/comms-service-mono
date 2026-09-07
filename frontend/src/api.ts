import type {
  ApiErrorDetails,
  ApiKeyRow,
  AuthUser,
  Category,
  CategoryWithAttached,
  CreatedApiKey,
  CreatedProject,
  ManagedUser,
  MessageLog,
  Project,
  Role,
  Template,
} from './types'

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:3000'

// Called when any request comes back 401 (session missing/expired). The
// AuthProvider registers this to drop the user and send them to the login view.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

// One error type for everything a screen needs to branch on:
//   isNetwork  → couldn't reach the backend at all (show the "is it running?" banner)
//   status     → HTTP status for 400 / 409 handling
//   details    → the backend's { fieldErrors, formErrors } envelope, when present
export class ApiError extends Error {
  status: number
  isNetwork: boolean
  details?: ApiErrorDetails

  constructor(
    message: string,
    opts: { status?: number; isNetwork?: boolean; details?: ApiErrorDetails } = {}
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = opts.status ?? 0
    this.isNetwork = opts.isNetwork ?? false
    this.details = opts.details
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | undefined> }
): Promise<T> {
  const { query, ...rest } = init ?? {}
  let url = API_BASE + path
  if (query) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') qs.set(k, v)
    }
    const s = qs.toString()
    if (s) url += `?${s}`
  }

  let res: Response
  try {
    res = await fetch(url, {
      ...rest,
      // Send the httpOnly session cookie with every request. We still never set
      // an Authorization header — that scheme is reserved for the send API.
      credentials: 'include',
      headers: {
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(rest.headers ?? {}),
      },
    })
  } catch {
    throw new ApiError(`Can't reach the API at ${API_BASE}`, { isNetwork: true })
  }

  const text = await res.text()
  let parsed: unknown = undefined
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!res.ok) {
    // Session gone/expired: let the app drop to the login view. Skip the /auth/*
    // probes themselves (login failure, the initial /auth/me check) so they can
    // handle their own 401 without triggering a redirect.
    if (res.status === 401 && !path.startsWith('/auth/')) {
      onUnauthorized?.()
    }
    const bodyObj = (parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {})
    const message =
      (typeof bodyObj.error === 'string' && bodyObj.error) || `Request failed (${res.status})`
    throw new ApiError(message, {
      status: res.status,
      details: bodyObj.details as ApiErrorDetails | undefined,
    })
  }

  return parsed as T
}

// ---------- Uploads ----------
// A dedicated fetch, not request<T>() — that helper always sets
// Content-Type: application/json whenever a body is present, which would
// break the multipart boundary the browser sets automatically for FormData.
export async function uploadImage(file: File): Promise<{ url: string }> {
  const form = new FormData()
  form.append('file', file)

  let res: Response
  try {
    res = await fetch(`${API_BASE}/uploads`, { method: 'POST', body: form })
  } catch {
    throw new ApiError(`Can't reach the API at ${API_BASE}`, { isNetwork: true })
  }

  const text = await res.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : undefined
  } catch {
    parsed = text
  }

  if (!res.ok) {
    const bodyObj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    const message = (typeof bodyObj.error === 'string' && bodyObj.error) || `Upload failed (${res.status})`
    throw new ApiError(message, { status: res.status })
  }

  const { url } = parsed as { url: string }
  return { url: `${API_BASE}${url}` }
}

// ---------- Projects ----------
export const listProjects = () => request<Project[]>('/projects')

export const getProject = (projectId: string) =>
  request<Project>(`/projects/${projectId}`)

export const createProject = (name: string) =>
  request<CreatedProject>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

// ---------- API keys (per-project, multi-owner) ----------
export const listApiKeys = (projectId: string) =>
  request<ApiKeyRow[]>(`/projects/${projectId}/api-keys`)

export const createApiKey = (projectId: string, name: string, expiresInDays?: number) =>
  request<CreatedApiKey>(`/projects/${projectId}/api-keys`, {
    method: 'POST',
    body: JSON.stringify({ name, expires_in_days: expiresInDays }),
  })

// Fetched fresh each time the owner clicks Copy — never cached client-side.
export const revealApiKey = (projectId: string, keyId: string) =>
  request<{ value: string }>(`/projects/${projectId}/api-keys/${keyId}/reveal`)

// Removes the row entirely. The API refuses this while a key is still active —
// revoke first, so whatever is using it gets an accurate error.
export const deleteApiKey = (projectId: string, keyId: string) =>
  request<{ deleted: true }>(`/projects/${projectId}/api-keys/${keyId}`, {
    method: 'DELETE',
  })

export const revokeApiKey = (projectId: string, keyId: string) =>
  request<{ id: string; status: 'revoked' }>(
    `/projects/${projectId}/api-keys/${keyId}/revoke`,
    { method: 'POST' }
  )

// ---------- Templates ----------
export const listTemplates = (projectId: string) =>
  request<Template[]>(`/projects/${projectId}/templates`)

export const getTemplate = (projectId: string, templateKey: string) =>
  request<Template>(`/projects/${projectId}/templates/${templateKey}`)

export const createTemplate = (projectId: string, body: unknown) =>
  request<Template>(`/projects/${projectId}/templates`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const updateChannel = (
  projectId: string,
  templateKey: string,
  channel: string,
  body: unknown
) =>
  request<Template>(`/projects/${projectId}/templates/${templateKey}/${channel}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

// ---------- Categories (global — not scoped to a project) ----------
export const listCategories = () => request<Category[]>('/categories')

export const createCategory = (
  name: string,
  templates?: { project_id: string; template_key: string }[]
) =>
  request<Category>('/categories', {
    method: 'POST',
    body: JSON.stringify({ name, templates }),
  })

// `templates`, when given, replaces the category's whole attachment set — so
// pass the complete list you want, not just additions.
export const updateCategory = (
  categoryId: string,
  patch: { name?: string; templates?: { project_id: string; template_key: string }[] }
) =>
  request<Category>(`/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

export const deleteCategory = (categoryId: string) =>
  request<{ deleted: true; detached: number }>(`/categories/${categoryId}`, {
    method: 'DELETE',
  })

// The category and everything attached to it, across every project the caller
// can see — no project needs picking first.
export const getCategory = (categoryId: string) =>
  request<CategoryWithAttached>(`/categories/${categoryId}`)

// ---------- Logs ----------
export const listLogs = (
  projectId: string,
  filters: { status?: string; channel?: string; template_key?: string } = {}
) => request<MessageLog[]>(`/projects/${projectId}/logs`, { query: filters })

// ---------- Auth ----------
export const login = (email: string, password: string) =>
  request<AuthUser>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

export const logout = () => request<{ ok: true }>('/auth/logout', { method: 'POST' })

export const getMe = () => request<AuthUser>('/auth/me')

// Self-service password change for the logged-in user. No currentPassword; the
// server derives the target from the session, never the body.
export const changeMyPassword = (newPassword: string) =>
  request<{ ok: true }>('/auth/me/password', {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  })

// ---------- Users & access (admin only) ----------
export interface CreateUserBody {
  name: string
  email: string
  password: string
  role: Role
  project_ids?: string[]
}

// All fields optional; omit `password` to leave it unchanged.
export interface UpdateUserBody {
  name?: string
  email?: string
  password?: string
  role?: Role
  status?: 'active' | 'disabled'
  project_ids?: string[]
}

export const listUsers = () => request<ManagedUser[]>('/users')

export const createUser = (body: CreateUserBody) =>
  request<ManagedUser>('/users', { method: 'POST', body: JSON.stringify(body) })

export const updateUser = (id: string, body: UpdateUserBody) =>
  request<ManagedUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
