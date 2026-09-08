import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiError, API_BASE, listLogs } from '../api'
import type { MessageLog, MessageStatus } from '../types'
import { ApiBanner, Dropdown, PageHeader, StatusBadge } from '../components/ui'
import { formatDate } from '../util'

const STATUSES: MessageStatus[] = ['sent', 'failed']
const CHANNELS = ['email', 'sms', 'push']

export function Logs(_props: { path?: string }) {
  const { selectedProject, projects, setSelectedProjectId } = useStore()
  const projectName = (id: string) => projects.find((p) => p._id === id)?.name ?? '—'
  const [logs, setLogs] = useState<MessageLog[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)

  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [templateKey, setTemplateKey] = useState('')

  useEffect(() => {
    if (!selectedProject) {
      setLoading(false)
      return
    }
    const pid = selectedProject._id
    let cancelled = false
    setLoading(true)
    setUnreachable(false)
    // Only append params that are actually set (handled inside listLogs).
    listLogs(pid, {
      status: status || undefined,
      channel: channel || undefined,
      template_key: templateKey.trim() || undefined,
    })
      .then((data) => {
        if (!cancelled) setLogs(data)
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
  }, [selectedProject, status, channel, templateKey])

  if (!selectedProject) {
    return (
      <div>
        <PageHeader title="Notification Logs" />
        <div class="empty">Select a project in the top bar to view its send history.</div>
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
          <label>Status</label>
          <Dropdown
            value={status}
            onChange={setStatus}
            options={[{ value: '', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
          />
        </div>
        <div class="field toolbar-field">
          <label>Channel</label>
          <Dropdown
            value={channel}
            onChange={setChannel}
            options={[{ value: '', label: 'All channels' }, ...CHANNELS.map((c) => ({ value: c, label: c }))]}
          />
        </div>
        <div class="field toolbar-field" style={{ minWidth: 220 }}>
          <label>Template key</label>
          <input
            type="text"
            class="mono"
            placeholder="WELCOME_EMAIL"
            value={templateKey}
            onInput={(e) => setTemplateKey((e.target as HTMLInputElement).value)}
          />
        </div>
        {(status || channel || templateKey) && (
          <button
            class="btn btn-sm"
            onClick={() => {
              setStatus('')
              setChannel('')
              setTemplateKey('')
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
            ) : logs.length === 0 ? (
              <tr class="state-row">
                <td colSpan={6}>
                  {status || channel || templateKey
                    ? 'No sends match these filters.'
                    : 'No sends yet for this project.'}
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                // The row goes to the project this send belongs to. The two
                // exceptions carry their own stopPropagation: the template key
                // (goes to the template) and the details button (opens the
                // drawer). Selecting the project as we leave keeps the rest of
                // the app pointed at what you just opened.
                <tr
                  key={log._id}
                  class="clickable"
                  title={`Open project ${projectName(log.project_id)}`}
                  onClick={() => {
                    setSelectedProjectId(log.project_id)
                    route(`/projects/${log.project_id}`)
                  }}
                >
                  <td>
                    {/* Goes to the template, not the send detail — so
                        stopPropagation, or the row's drawer opens too. Logs are
                        already scoped to the selected project, so the template
                        page resolves this key against the same project. */}
                    <button
                      type="button"
                      class="cell-link mono"
                      title={`Open template ${log.template_key}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        route(`/templates/${log.template_key}`)
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
