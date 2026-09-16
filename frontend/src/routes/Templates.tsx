import { useEffect, useRef, useState } from 'preact/hooks'
import { Fragment } from 'preact'
import { route } from 'preact-router'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { ApiError, API_BASE, approveTemplate, listTemplates, rejectTemplate } from '../api'
import type { Template, TemplateStatusFilter } from '../types'
import { ApiBanner, ChannelChips, Dropdown, PageHeader, StatusBadge, Toast } from '../components/ui'
import { enabledChannels, formatDate } from '../util'

const STATUS_OPTIONS: { value: TemplateStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export function Templates(_props: { path?: string }) {
  const { projects, selectedProjectId, selectedProject, setSelectedProjectId } = useStore()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TemplateStatusFilter>('all')

  // Reject flow: which row's inline reason editor is open, and its draft text.
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  // The row with an approve/reject request in flight — its buttons disable.
  const [actioningId, setActioningId] = useState<string | null>(null)

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
    // Reset any open reject editor when the project changes underneath us.
    setRejectingId(null)

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

  async function onConfirmReject(t: Template) {
    setActioningId(t._id)
    try {
      const reason = rejectReason.trim()
      applyUpdate(await rejectTemplate(t._id, reason || undefined))
      showToast(`${t.name} rejected`)
      setRejectingId(null)
      setRejectReason('')
    } catch {
      showToast(`Couldn't reject ${t.name}`, 'error')
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr class="state-row">
                <td colSpan={5}>Loading…</td>
              </tr>
            ) : unreachable ? (
              <tr class="state-row">
                <td colSpan={5}>Couldn't load templates.</td>
              </tr>
            ) : visible.length === 0 ? (
              <tr class="state-row">
                <td colSpan={5}>
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
                          // A non-admin sees "pending approval" — it's awaiting an
                          // admin. The admin's own queue keeps the terse "pending".
                          label={!isAdmin && t.status === 'pending' ? 'pending approval' : undefined}
                        />
                      </td>
                      <td class="cell-faint">{formatDate(t.updated_at)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {canReview ? (
                          <div class="row-actions">
                            <button
                              class="btn btn-primary btn-sm"
                              disabled={busy}
                              onClick={() => onApprove(t)}
                            >
                              Approve
                            </button>
                            <button
                              class="btn btn-danger btn-sm"
                              disabled={busy}
                              onClick={() => {
                                setRejectingId((cur) => (cur === t._id ? cur : t._id))
                                setRejectReason('')
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span class="cell-faint">—</span>
                        )}
                      </td>
                    </tr>
                    {canReview && rejectingId === t._id && (
                      <tr class="reject-inline" onClick={(e) => e.stopPropagation()}>
                        <td colSpan={5}>
                          <div class="reject-inline-inner">
                            <span class="reject-inline-label">Reason (optional)</span>
                            <input
                              type="text"
                              autoFocus
                              value={rejectReason}
                              placeholder="Why is this being rejected?"
                              disabled={busy}
                              onInput={(e) =>
                                setRejectReason((e.target as HTMLInputElement).value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') onConfirmReject(t)
                                if (e.key === 'Escape') {
                                  setRejectingId(null)
                                  setRejectReason('')
                                }
                              }}
                            />
                            <button
                              class="btn btn-danger btn-sm"
                              disabled={busy}
                              onClick={() => onConfirmReject(t)}
                            >
                              Confirm reject
                            </button>
                            <button
                              class="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={() => {
                                setRejectingId(null)
                                setRejectReason('')
                              }}
                            >
                              Cancel
                            </button>
                          </div>
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
