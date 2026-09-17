import { useEffect, useRef, useState } from 'preact/hooks'
import { Fragment } from 'preact'
import { route } from 'preact-router'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { ApiError, API_BASE, approveTemplate, listTemplates, rejectTemplate, returnTemplate } from '../api'
import type { Template, TemplateStatusFilter } from '../types'
import {
  ApiBanner,
  ChannelChips,
  CheckIcon,
  CrossIcon,
  Dropdown,
  PageHeader,
  ReturnIcon,
  StatusBadge,
  Toast,
} from '../components/ui'
import { enabledChannels, formatDate } from '../util'

const STATUS_OPTIONS: { value: TemplateStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'returned', label: 'Returned' },
]

// The inline editor under a pending row is shared by Reject (optional reason)
// and Return (required remarks).
type InlineMode = 'reject' | 'return'

export function Templates(_props: { path?: string }) {
  const { projects, selectedProjectId, selectedProject, setSelectedProjectId } = useStore()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TemplateStatusFilter>('all')

  // Inline editor: which row is open and in which mode (reject / return), plus
  // its draft text and any validation error (return requires non-empty remarks).
  const [inline, setInline] = useState<{ id: string; mode: InlineMode } | null>(null)
  const [inlineText, setInlineText] = useState('')
  const [inlineError, setInlineError] = useState<string | null>(null)
  // The row with a review request in flight — its buttons disable.
  const [actioningId, setActioningId] = useState<string | null>(null)

  function openInline(id: string, mode: InlineMode) {
    setInline({ id, mode })
    setInlineText('')
    setInlineError(null)
  }
  function closeInline() {
    setInline(null)
    setInlineText('')
    setInlineError(null)
  }

  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const toastTimer = useRef<number | null>(null)
  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message, tone })
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  useEffect(() => {
    if (!selectedProject) {
      setLoading(false)
      return
    }
    const pid = selectedProject._id
    let cancelled = false
    setLoading(true)
    setUnreachable(false)
    // Close any open inline editor when the project changes underneath us.
    setInline(null)

    listTemplates(pid)
      .then((tpls) => {
        if (cancelled) return
        setTemplates(tpls)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.isNetwork) setUnreachable(true)
        setTemplates([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedProject])

  // The list is already loaded, so the Status filter narrows client-side — no
  // extra round-trip. (The list endpoint also accepts ?status for admins.)
  const visible =
    statusFilter === 'all' ? templates : templates.filter((t) => t.status === statusFilter)

  // The Actions column (approve/reject/return) is admin-only — a non-admin has no
  // review actions, so the whole column is dropped rather than shown empty.
  const colCount = isAdmin ? 5 : 4

  function applyUpdate(updated: Template) {
    setTemplates((prev) => prev.map((t) => (t._id === updated._id ? { ...t, ...updated } : t)))
  }

  async function onApprove(t: Template) {
    setActioningId(t._id)
    try {
      applyUpdate(await approveTemplate(t._id))
      showToast(`${t.name} approved`)
    } catch {
      showToast(`Couldn't approve ${t.name}`, 'error')
    } finally {
      setActioningId(null)
    }
  }

  async function onConfirmInline(t: Template) {
    if (!inline) return
    const mode = inline.mode
    const text = inlineText.trim()
    // Return demands remarks; block and flag if empty. Reject's reason is optional.
    if (mode === 'return' && !text) {
      setInlineError('Remarks are required to return a template.')
      return
    }
    setActioningId(t._id)
    try {
      if (mode === 'reject') {
        applyUpdate(await rejectTemplate(t._id, text || undefined))
        showToast(`${t.name} rejected`)
      } else {
        applyUpdate(await returnTemplate(t._id, text))
        showToast(`${t.name} returned`)
      }
      closeInline()
    } catch {
      showToast(`Couldn't ${mode} ${t.name}`, 'error')
    } finally {
      setActioningId(null)
    }
  }

  if (!selectedProject) {
    return (
      <div>
        <PageHeader title="Templates" />
        <div class="empty">Select a project in the top bar to view its templates.</div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle={`Message templates for ${selectedProject.name}.`}
        actions={
          <button class="btn btn-primary" onClick={() => route('/templates/new')}>
            + New template
          </button>
        }
      />

      {unreachable && <ApiBanner base={API_BASE} />}

      <div class="toolbar">
        <div class="field toolbar-field">
          <label>Project</label>
          <Dropdown
            class="project-select"
            disabled={projects.length === 0}
            placeholder="No projects yet"
            value={selectedProjectId ?? ''}
            onChange={setSelectedProjectId}
            options={projects.map((p) => ({ value: p._id, label: p.name }))}
          />
        </div>
        <div class="field toolbar-field">
          <label>Status</label>
          <Dropdown
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as TemplateStatusFilter)}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Template</th>
              <th>Channels</th>
              <th>Status</th>
              <th>Last updated</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr class="state-row">
                <td colSpan={colCount}>Loading…</td>
              </tr>
            ) : unreachable ? (
              <tr class="state-row">
                <td colSpan={colCount}>Couldn't load templates.</td>
              </tr>
            ) : visible.length === 0 ? (
              <tr class="state-row">
                <td colSpan={colCount}>
                  {statusFilter === 'all'
                    ? 'No templates yet — click New template to create one.'
                    : `No ${statusFilter} templates.`}
                </td>
              </tr>
            ) : (
              visible.map((t) => {
                const busy = actioningId === t._id
                const canReview = isAdmin && t.status === 'pending'
                return (
                  <Fragment key={t._id}>
                    <tr class="clickable" onClick={() => route(`/templates/${t.template_key}`)}>
                      <td>
                        <div class="cell-primary">{t.name}</div>
                        <div class="cell-secondary mono">{t.template_key}</div>
                      </td>
                      <td>
                        <ChannelChips channels={enabledChannels(t.channels ?? {})} />
                      </td>
                      <td>
                        <StatusBadge
                          status={t.status}
                          label={
                            t.status === 'returned'
                              ? 'Returned for edits'
                              : // A non-admin sees "pending approval" — it's awaiting an
                                // admin. The admin's own queue keeps the terse "pending".
                                !isAdmin && t.status === 'pending'
                                ? 'pending approval'
                                : undefined
                          }
                        />
                      </td>
                      <td class="cell-faint">{formatDate(t.updated_at)}</td>
                      {isAdmin && (
                      <td onClick={(e) => e.stopPropagation()}>
                        {canReview ? (
                          <div class="row-actions">
                            <button
                              class="icon-btn icon-btn-approve"
                              title="Approve"
                              aria-label="Approve"
                              disabled={busy}
                              onClick={() => onApprove(t)}
                            >
                              <CheckIcon />
                            </button>
                            <button
                              class="icon-btn icon-btn-reject"
                              title="Reject"
                              aria-label="Reject"
                              disabled={busy}
                              onClick={() => openInline(t._id, 'reject')}
                            >
                              <CrossIcon />
                            </button>
                            <button
                              class="icon-btn icon-btn-return"
                              title="Return with remarks"
                              aria-label="Return with remarks"
                              disabled={busy}
                              onClick={() => openInline(t._id, 'return')}
                            >
                              <ReturnIcon />
                            </button>
                          </div>
                        ) : (
                          <span class="cell-faint actions-empty">—</span>
                        )}
                      </td>
                      )}
                    </tr>
                    {canReview && inline?.id === t._id && (
                      <tr class="reject-inline" onClick={(e) => e.stopPropagation()}>
                        <td colSpan={colCount}>
                          <div class="reject-inline-inner">
                            <span class="reject-inline-label">
                              {inline.mode === 'return'
                                ? 'Remarks — what needs to change? (required)'
                                : 'Reason (optional)'}
                            </span>
                            <input
                              type="text"
                              autoFocus
                              value={inlineText}
                              class={inlineError ? 'invalid' : ''}
                              placeholder={
                                inline.mode === 'return'
                                  ? 'Describe what needs changing…'
                                  : 'Why is this being rejected?'
                              }
                              disabled={busy}
                              onInput={(e) => {
                                setInlineText((e.target as HTMLInputElement).value)
                                if (inlineError) setInlineError(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') onConfirmInline(t)
                                if (e.key === 'Escape') closeInline()
                              }}
                            />
                            <button
                              class={`btn btn-sm ${inline.mode === 'return' ? 'btn-info' : 'btn-danger'}`}
                              disabled={busy}
                              onClick={() => onConfirmInline(t)}
                            >
                              {inline.mode === 'return' ? 'Confirm return' : 'Confirm reject'}
                            </button>
                            <button
                              class="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={closeInline}
                            >
                              Cancel
                            </button>
                          </div>
                          {inlineError && <div class="inline-error">{inlineError}</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  )
}
