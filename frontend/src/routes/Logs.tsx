import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiError, API_BASE, listCategories, listLogs } from '../api'
import type { Category, MessageLog, MessageStatus } from '../types'
import { ApiBanner, Dropdown, PageHeader, StatusBadge } from '../components/ui'
import { formatDate, linkWithReturn } from '../util'

const STATUSES: MessageStatus[] = ['sent', 'failed']
const CHANNELS = ['email', 'sms', 'push']

export function Logs(_props: { path?: string }) {
  const { projects, setSelectedProjectId } = useStore()
  const projectName = (id: string) => projects.find((p) => p._id === id)?.name ?? '—'
  const [logs, setLogs] = useState<MessageLog[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)

  // Local to this page so "All projects" ('') doesn't clobber the global
  // selection other pages depend on. Defaults to every project.
  const [projectFilter, setProjectFilter] = useState('')
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  // Categories are global; used to build the filter dropdown and to resolve
  // which template keys belong to the chosen category.
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryFilter, setCategoryFilter] = useState('')

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    if (projects.length === 0) {
      setLogs([])
      setLoading(false)
      return
    }
    // '' means every project — fan out one request per project and merge,
    // newest first, since the backend only lists logs one project at a time.
    const targets = projectFilter ? [projectFilter] : projects.map((p) => p._id)
    let cancelled = false
    setLoading(true)
    setUnreachable(false)
    // Only append params that are actually set (handled inside listLogs).
    const filters = { status: status || undefined, channel: channel || undefined }
    Promise.all(targets.map((pid) => listLogs(pid, filters)))
      .then((batches) => {
        if (cancelled) return
        const merged = batches
          .flat()
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        setLogs(merged)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.isNetwork) setUnreachable(true)
        setLogs([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectFilter, projects, status, channel])

  // Category is filtered in the browser. A category can span projects, so match
  // on project_id + template_key together, not the key alone.
  const categoryKeys = categoryFilter
    ? new Set(
        categories
          .find((c) => c._id === categoryFilter)
          ?.templates.map((t) => `${t.project_id}::${t.template_key}`) ?? []
      )
    : null
  const visibleLogs = categoryKeys
    ? logs.filter((log) => categoryKeys.has(`${log.project_id}::${log.template_key}`))
    : logs

  if (projects.length === 0) {
    return (
      <div>
        <PageHeader title="Notification Logs" />
        <div class="empty">No projects yet — create one to see its send history.</div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Notification Logs"
        // subtitle={`Send history for ${selectedProject.name} · newest first, up to 200 rows.`}
      />

      {unreachable && <ApiBanner base={API_BASE} />}

      <div class="toolbar">
        <div class="field toolbar-field">
          <label>Project</label>
          <Dropdown
            class="project-select"
            value={projectFilter}
            onChange={setProjectFilter}
            onClear={() => setProjectFilter('')}
            options={[
              { value: '', label: 'All projects' },
              ...projects.map((p) => ({ value: p._id, label: p.name })),
            ]}
          />
        </div>
        <div class="field toolbar-field">
          <label>Category</label>
          <Dropdown
            value={categoryFilter}
            onChange={setCategoryFilter}
            onClear={() => setCategoryFilter('')}
            options={[
              { value: '', label: 'All categories' },
              ...categories.map((c) => ({ value: c._id, label: c.name })),
            ]}
          />
        </div>
        <div class="field toolbar-field">
          <label>Status</label>
          <Dropdown
            value={status}
            onChange={setStatus}
            onClear={() => setStatus('')}
            options={[{ value: '', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
          />
        </div>
        <div class="field toolbar-field">
          <label>Channel</label>
          <Dropdown
            value={channel}
            onChange={setChannel}
            onClear={() => setChannel('')}
            options={[{ value: '', label: 'All channels' }, ...CHANNELS.map((c) => ({ value: c, label: c }))]}
          />
        </div>
        {(projectFilter || categoryFilter || status || channel) && (
          <button
            class="btn btn-sm"
            onClick={() => {
              setProjectFilter('')
              setCategoryFilter('')
              setStatus('')
              setChannel('')
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Template</th>
              <th>Project</th>
              <th>Channel</th>
              <th>Recipient</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr class="state-row">
                <td colSpan={6}>Loading…</td>
              </tr>
            ) : unreachable ? (
              <tr class="state-row">
                <td colSpan={6}>Couldn't load logs.</td>
              </tr>
            ) : visibleLogs.length === 0 ? (
              <tr class="state-row">
                <td colSpan={6}>
                  {status || channel || categoryFilter
                    ? 'No sends match these filters.'
                    : 'No sends yet for this project.'}
                </td>
              </tr>
            ) : (
              visibleLogs.map((log) => (
                // The row goes to the project this send belongs to; the
                // template key is the one exception and stopPropagations to
                // reach the template instead. Selecting the project as we leave
                // keeps the rest of the app pointed at what you just opened.
                <tr
                  key={log._id}
                  class="clickable"
                  title={`Open project ${projectName(log.project_id)}`}
                  onClick={() => {
                    setSelectedProjectId(log.project_id)
                    route(
                      linkWithReturn(
                        `/projects/${log.project_id}`,
                        '/logs',
                        'notification logs'
                      )
                    )
                  }}
                >
                  <td>
                    {/* The template page resolves this key against the selected
                        project, so point it at the row's own project first —
                        under "All projects" the row may belong to another one.
                        The link remembers to come back here. */}
                    <button
                      type="button"
                      class="cell-link mono"
                      title={`Open template ${log.template_key}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedProjectId(log.project_id)
                        route(
                          linkWithReturn(
                            `/templates/${log.template_key}`,
                            '/logs',
                            'notification logs'
                          )
                        )
                      }}
                    >
                      {log.template_key}
                    </button>
                  </td>
                  {/* Resolved from the row's own project_id rather than assumed
                      from the selected project, so the name always describes
                      the template this send actually used. */}
                  <td class="cell-muted">{projectName(log.project_id)}</td>
                  <td>
                    <span class="chip">{log.channel}</span>
                  </td>
                  <td class="cell-muted">{log.recipient}</td>
                  <td>
                    <StatusBadge status={log.status} />
                  </td>
                  <td class="cell-faint">{formatDate(log.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}
