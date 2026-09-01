import type {
  ApiErrorDetails,
  CreatedProject,
  MessageLog,
  Project,
  Template,
} from './types'

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:3000'

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
      headers: {
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(rest.headers ?? {}),
      },
      // NOTE: never send an Authorization header — the dashboard is unauthenticated.
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

// ---------- Projects ----------
export const listProjects = () => request<Project[]>('/projects')

export const createProject = (name: string) =>
  request<CreatedProject>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

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

export const listCategories = (projectId: string) =>
  request<string[]>(`/projects/${projectId}/categories`)

// ---------- Logs ----------
export const listLogs = (
  projectId: string,
  filters: { status?: string; channel?: string; template_key?: string } = {}
) => request<MessageLog[]>(`/projects/${projectId}/logs`, { query: filters })
