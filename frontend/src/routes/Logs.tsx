import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiError, API_BASE, listLogs } from '../api'
import type { MessageLog, MessageStatus } from '../types'
import { ApiBanner, Drawer, Dropdown, PageHeader, StatusBadge } from '../components/ui'
import { formatDate } from '../util'

const STATUSES: MessageStatus[] = ['sent', 'failed']
const CHANNELS = ['email', 'sms', 'push']

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  )
}

export function Logs(_props: { path?: string }) {
  const { selectedProject, projects, setSelectedProjectId } = useStore()
  const projectName = (id: string) => projects.find((p) => p._id === id)?.name ?? '—'
  const [logs, setLogs] = useState<MessageLog[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)

  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [templateKey, setTemplateKey] = useState('')

  const [selected, setSelected] = useState<MessageLog | null>(null)

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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr class="state-row">
                <td colSpan={7}>Loading…</td>
              </tr>
            ) : unreachable ? (
              <tr class="state-row">
                <td colSpan={7}>Couldn't load logs.</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr class="state-row">
                <td colSpan={7}>
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
                  <td style={{ textAlign: 'right' }}>
                    {/* The row navigates now, so the send detail (payload,
                        provider id, attempts) needs its own way in. */}
                    <button
                      type="button"
                      class="icon-btn"
                      title="Send details"
                      aria-label={`Send details for ${log.template_key}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelected(log)
                      }}
                    >
                      <InfoIcon />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <Drawer title="Send detail" onClose={() => setSelected(null)}>
          <dl class="dl">
            <dt>Template key</dt>
            <dd>
              <button
                type="button"
                class="cell-link mono"
                title={`Open template ${selected.template_key}`}
                onClick={() => route(`/templates/${selected.template_key}`)}
              >
                {selected.template_key}
              </button>
            </dd>

            <dt>Project</dt>
            <dd>{projectName(selected.project_id)}</dd>

            <dt>Channel</dt>
            <dd>
              <span class="chip">{selected.channel}</span>
            </dd>

            <dt>Recipient</dt>
            <dd>{selected.recipient}</dd>

            <dt>Status</dt>
            <dd>
              <StatusBadge status={selected.status} />
            </dd>

            <dt>Attempts</dt>
            <dd>{selected.attempts}</dd>

            <dt>Provider msg ID</dt>
            <dd class="mono">{selected.provider_message_id ?? '—'}</dd>

            <dt>Created</dt>
            <dd>{formatDate(selected.created_at)}</dd>
          </dl>

          <label style={{ marginTop: 18 }}>Data</label>
          <pre class="pre">{JSON.stringify(selected.data ?? {}, null, 2)}</pre>
        </Drawer>
      )}
    </div>
  )
}
