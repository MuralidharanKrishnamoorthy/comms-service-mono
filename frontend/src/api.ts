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
  TemplateStatusFilter,
} from './types'

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:3000'

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

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
    res = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    })
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
    if (res.status === 401) {
      onUnauthorized?.()
    }
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
// Every paged list endpoint returns this envelope: the page of rows plus the
// counts the UI needs. totalItems/totalPages describe the FILTERED set.
export interface PaginationMeta {
  page: number
  limit: number
  totalItems: number
  totalPages: number
}
export interface Paginated<T> {
  data: T[]
  pagination: PaginationMeta
}

// `status` narrows the list to one review status; omit or pass 'all' for no
// filter. `page` selects the 10-row window; filters are applied server-side
// before pagination.
export const listTemplates = (
  projectId: string,
  opts: { status?: TemplateStatusFilter; page?: number } = {}
) =>
  request<Paginated<Template>>(`/projects/${projectId}/templates`, {
    query: {
      status: opts.status && opts.status !== 'all' ? opts.status : undefined,
      page: opts.page ? String(opts.page) : undefined,
    },
  })

// The cross-project, paginated templates list behind the Templates page.
// `project` and `status` are optional filters applied server-side before the
// page window; omit `project` to span every project the caller can see.
export const listTemplatesList = (
  opts: { project?: string; status?: TemplateStatusFilter; page?: number } = {}
) =>
  request<Paginated<Template>>('/templates', {
    query: {
      project: opts.project || undefined,
      status: opts.status && opts.status !== 'all' ? opts.status : undefined,
      page: opts.page ? String(opts.page) : undefined,
    },
  })

// How many templates need an admin's attention right now — a brand-new
// submission or an edit awaiting approval on a live one. Just the count, so
// the sidebar badge costs one small page fetch, not the full list.
export const countTemplatesNeedingReview = () =>
  request<Paginated<Template>>('/templates', { query: { needs_review: 'true', limit: '1' } }).then(
    (res) => res.pagination.totalItems
  )

// The full template list for a project, paged through behind the scenes — for
// callers that genuinely need every row (e.g. the category template picker),
// not a single page. The list endpoint itself stays capped at 10 per page.
export const listAllTemplates = async (
  projectId: string,
  status?: TemplateStatusFilter
): Promise<Template[]> => {
  const all: Template[] = []
  let page = 1
  for (;;) {
    const res = await listTemplates(projectId, { status, page })
    all.push(...res.data)
    if (res.data.length === 0 || page >= res.pagination.totalPages) break
    page++
  }
  return all
}

// Approve/reject a template by id (admin only). Both return the updated template.
export const approveTemplate = (templateId: string) =>
  request<Template>(`/templates/${templateId}/approve`, { method: 'PATCH' })

export const rejectTemplate = (templateId: string, reason?: string) =>
  request<Template>(`/templates/${templateId}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  })

// Return a template to its author for edits (admin only). Remarks are required.
export const returnTemplate = (templateId: string, remarks: string) =>
  request<Template>(`/templates/${templateId}/return`, {
    method: 'PATCH',
    body: JSON.stringify({ remarks }),
  })

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
export const testSendChannel = (
  projectId: string,
  templateKey: string,
  channel: string,
  recipient: string,
  data: Record<string, string>
) =>
  request<{ status: 'sent' }>(`/projects/${projectId}/templates/${templateKey}/${channel}/test-send`, {
    method: 'POST',
    body: JSON.stringify({ recipient, data }),
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
// Cross-project, paginated logs feed. Every argument is an optional filter
// applied server-side before the page window; `project` and `category` narrow
// scope, `page` selects the window.
export const listLogs = (
  filters: {
    project?: string
    category?: string
    status?: string
    channel?: string
    page?: number
  } = {}
) =>
  request<Paginated<MessageLog>>('/logs', {
    query: {
      project: filters.project || undefined,
      category: filters.category || undefined,
      status: filters.status || undefined,
      channel: filters.channel || undefined,
      page: filters.page ? String(filters.page) : undefined,
    },
  })

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

export const listUsers = (opts: { page?: number } = {}) =>
  request<Paginated<ManagedUser>>('/users', {
    query: { page: opts.page ? String(opts.page) : undefined },
  })

export const createUser = (body: CreateUserBody) =>
  request<ManagedUser>('/users', { method: 'POST', body: JSON.stringify(body) })

export const updateUser = (id: string, body: UpdateUserBody) =>
  request<ManagedUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
