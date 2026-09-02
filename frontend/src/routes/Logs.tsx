import { useEffect, useState } from 'preact/hooks'
import { useStore } from '../store'
import { ApiError, API_BASE, listLogs } from '../api'
import type { MessageLog, MessageStatus } from '../types'
import { ApiBanner, Drawer, PageHeader, StatusBadge } from '../components/ui'
import { formatDate } from '../util'

const STATUSES: MessageStatus[] = ['pending', 'sent', 'delivered', 'failed']
const CHANNELS = ['email', 'sms', 'push']

export function Logs(_props: { path?: string }) {
  const { selectedProject } = useStore()
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
        subtitle={`Send history for ${selectedProject.name} · newest first, up to 200 rows.`}
      />

      {unreachable && <ApiBanner base={API_BASE} />}

      <div class="toolbar">
        <div class="field toolbar-field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div class="field toolbar-field">
          <label>Channel</label>
          <select value={channel} onChange={(e) => setChannel((e.target as HTMLSelectElement).value)}>
            <option value="">All channels</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
              <th>Channel</th>
              <th>Recipient</th>
              <th>Status</th>
              <th>Attempts</th>
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
                <tr key={log._id} class="clickable" onClick={() => setSelected(log)}>
                  <td class="mono">{log.template_key}</td>
                  <td>
                    <span class="chip">{log.channel}</span>
                  </td>
                  <td class="cell-muted">{log.recipient}</td>
                  <td>
                    <StatusBadge status={log.status} />
                  </td>
                  <td class="cell-muted">{log.attempts}</td>
                  <td class="cell-faint">{formatDate(log.created_at)}</td>
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
            <dd class="mono">{selected.template_key}</dd>

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
