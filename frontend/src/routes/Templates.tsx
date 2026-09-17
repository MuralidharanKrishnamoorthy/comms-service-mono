import { useEffect, useState } from 'preact/hooks'
import { Fragment } from 'preact'
import { route } from 'preact-router'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { API_BASE, approveTemplate, listTemplatesList, rejectTemplate, returnTemplate } from '../api'
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
  useToast,
} from '../components/ui'
import { enabledChannels, formatDate } from '../util'
import { Pagination } from '../components/Pagination'
import { usePagedList } from '../usePagedList'

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
  const { projects, setSelectedProjectId } = useStore()
  const [projectFilter, setProjectFilter] = useState('')
  const projectName = (id: string) => projects.find((p) => p._id === id)?.name ?? '—'
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [statusFilter, setStatusFilter] = useState<TemplateStatusFilter>('all')

  // Cross-project, server-side list: the project + status filters are applied
  // before the page window. The filter key includes both, so changing either
  // resets to page 1. Without a project filter it spans every project the caller
  // can see.
  const list = usePagedList<Template>(
    (page) =>
      listTemplatesList({
        project: projectFilter || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
      }),
    `${projectFilter}|${statusFilter}`,
    projects.length > 0
  )

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

  const { toast, showToast } = useToast()

  // Close any open inline editor when the project or status filter changes.
  useEffect(() => {
    setInline(null)
  }, [projectFilter, statusFilter])

  const visible = list.items

  // The Project column shows only in the all-projects view. The Actions column
  // (approve/reject/return) is admin-only — a non-admin has no review actions,
  // so that column is dropped rather than shown empty.
  const showProject = !projectFilter
  const colCount = (isAdmin ? 5 : 4) + (showProject ? 1 : 0)

  // A review action changes a row's status (and may move it out of the current
  // filter), so refetch the page to keep the list and its counts honest. The
  // updated template is ignored — the refetch is the source of truth.
  const applyUpdate = (_updated?: Template) => list.reload()

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

  if (projects.length === 0) {
    return (
      <div>
        <PageHeader title="Templates" />
        <div class="empty">No projects yet — create one before adding templates.</div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle={
          projectFilter
            ? `Message templates for ${projectName(projectFilter)}.`
            : 'Message templates across all your projects.'
        }
        actions={
          <button class="btn btn-primary" onClick={() => route('/templates/new')}>
            + New template
          </button>
        }
      />

      {list.unreachable && <ApiBanner base={API_BASE} />}

      <div class="toolbar">
        <div class="field toolbar-field">
          <label>Project</label>
          <Dropdown
            class="project-select"
            value={projectFilter}
            onChange={(value) => {
              setProjectFilter(value)
              if (value) setSelectedProjectId(value)
            }}
            options={[
              { value: '', label: 'All projects' },
              ...projects.map((p) => ({ value: p._id, label: p.name })),
            ]}
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
              {showProject && <th>Project</th>}
              <th>Channels</th>
              <th>Status</th>
              <th>Last updated</th>
              {isAdmin && <th class="col-actions">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {list.loading ? (
              <tr class="state-row">
                <td colSpan={colCount}>Loading…</td>
              </tr>
            ) : list.unreachable ? (
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
                    <tr
                      class="clickable"
                      onClick={() => {
                        setSelectedProjectId(t.project_id)
                        route(`/templates/${t.template_key}`)
                      }}
                    >
                      <td>
                        <div class="cell-primary">{t.name}</div>
                        <div class="cell-secondary mono">{t.template_key}</div>
                      </td>
                      {showProject && <td class="cell-muted">{projectName(t.project_id)}</td>}
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
                      <td class="col-actions" onClick={(e) => e.stopPropagation()}>
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

      <Pagination
        currentPage={list.pagination.page}
        totalPages={list.pagination.totalPages}
        totalItems={list.pagination.totalItems}
        pageSize={list.pagination.limit}
        onPageChange={list.setPage}
      />

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  )
}
