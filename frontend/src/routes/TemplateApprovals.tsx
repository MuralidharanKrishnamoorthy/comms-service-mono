import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useAuth } from '../auth'
import {
  ApiError,
  API_BASE,
  approveTemplate,
  listReviewTemplates,
  rejectTemplate,
} from '../api'
import type { ReviewTemplate, TemplateStatusFilter } from '../types'
import { ApiBanner, Modal, PageHeader, TemplateStatusBadge } from '../components/ui'
import { formatDate } from '../util'

const FILTERS: { value: TemplateStatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

export function TemplateApprovals(_props: { path?: string }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [filter, setFilter] = useState<TemplateStatusFilter>('pending')
  const [rows, setRows] = useState<ReviewTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)

  // The row currently mid-request, so only its buttons disable/spin.
  const [actingId, setActingId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Reject modal state (optional reason).
  const [rejectTarget, setRejectTarget] = useState<ReviewTemplate | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Non-admins can't be here — send them to Projects. (Backend enforces it too.)
  useEffect(() => {
    if (!isAdmin) route('/projects', true)
  }, [isAdmin])

  const load = (f: TemplateStatusFilter) => {
    setLoading(true)
    setUnreachable(false)
    setActionError(null)
    listReviewTemplates(f)
      .then(setRows)
      .catch((err) => {
        if (err instanceof ApiError && err.isNetwork) setUnreachable(true)
        setRows([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (isAdmin) load(filter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, filter])

  if (!isAdmin) return null

  const approve = async (t: ReviewTemplate) => {
    setActingId(t._id)
    setActionError(null)
    setFlash(null)
    try {
      await approveTemplate(t._id)
      setFlash(`Approved "${t.name}".`)
      // Drop it from the current view if the filter no longer matches, else
      // reflect its new status in place.
      setRows((prev) =>
        filter === 'pending' ? prev.filter((r) => r._id !== t._id) : prev.map((r) => (r._id === t._id ? { ...r, status: 'approved' } : r))
      )
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to approve.')
    } finally {
      setActingId(null)
    }
  }

  const submitReject = async () => {
    const t = rejectTarget
    if (!t) return
    setActingId(t._id)
    setActionError(null)
    setFlash(null)
    try {
      const reason = rejectReason.trim()
      await rejectTemplate(t._id, reason || undefined)
      setFlash(`Rejected "${t.name}".`)
      setRows((prev) =>
        filter === 'pending'
          ? prev.filter((r) => r._id !== t._id)
          : prev.map((r) => (r._id === t._id ? { ...r, status: 'rejected', rejection_reason: reason || null } : r))
      )
      setRejectTarget(null)
      setRejectReason('')
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to reject.')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Template approvals"
        subtitle="Review templates submitted by your team before they can be used."
      />

      {flash && <div class="banner-success" role="status">{flash}</div>}
      {actionError && <div class="banner-error" role="alert">{actionError}</div>}
      {unreachable && <ApiBanner base={API_BASE} />}

      <div class="tabs" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            class={`tab ${filter === f.value ? 'active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Template</th>
              <th>Submitted by</th>
              <th>Project</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr class="state-row">
                <td colSpan={6}>Loading…</td>
              </tr>
            ) : unreachable ? (
              <tr class="state-row">
                <td colSpan={6}>Couldn't load templates.</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr class="state-row">
                <td colSpan={6}>
                  {filter === 'pending' ? 'Nothing waiting for review.' : 'No templates to show.'}
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t._id}>
                  <td>
                    <div class="cell-primary">{t.name}</div>
                    <div class="cell-secondary mono">{t.template_key}</div>
                  </td>
                  <td>
                    <div>{t.creator_name ?? '—'}</div>
                    {t.creator_email && <div class="cell-secondary">{t.creator_email}</div>}
                  </td>
                  <td class="cell-faint">{t.project_name ?? '—'}</td>
                  <td class="cell-faint">{formatDate(t.created_at)}</td>
                  <td>
                    <TemplateStatusBadge status={t.status} rejectionReason={t.rejection_reason} showReason />
                  </td>
                  <td>
                    {t.status === 'pending' ? (
                      <div class="row-actions">
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          disabled={actingId === t._id}
                          onClick={() => void approve(t)}
                        >
                          {actingId === t._id ? 'Working…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          class="btn btn-danger-solid btn-sm"
                          disabled={actingId === t._id}
                          onClick={() => {
                            setRejectReason('')
                            setActionError(null)
                            setRejectTarget(t)
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {rejectTarget && (
        <Modal title={`Reject "${rejectTarget.name}"`} onClose={() => setRejectTarget(null)} width={460}>
          <div class="field">
            <label>
              Reason <span class="hint">(optional — shown to the creator)</span>
            </label>
            <textarea
              rows={4}
              value={rejectReason}
              placeholder="e.g. Subject line is off-brand; please revise."
              onInput={(e) => setRejectReason((e.target as HTMLTextAreaElement).value)}
            />
          </div>
          <div class="form-actions">
            <button
              type="button"
              class="btn btn-danger-solid"
              disabled={actingId === rejectTarget._id}
              onClick={() => void submitReject()}
            >
              {actingId === rejectTarget._id ? 'Rejecting…' : 'Reject template'}
            </button>
            <button
              type="button"
              class="btn"
              disabled={actingId === rejectTarget._id}
              onClick={() => setRejectTarget(null)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
