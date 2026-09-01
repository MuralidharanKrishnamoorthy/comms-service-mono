import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { listTemplates } from '../api'
import { ApiError } from '../api'
import { PageHeader } from '../components/ui'

// The backend exposes no aggregate-stats endpoint, so this screen is a light
// placeholder: it counts what we can already fetch (projects, and templates for
// the selected project) and shows a static recent-sends table.
// TODO: wire to real stats endpoint once it exists.
export function Dashboard(_props: { path?: string }) {
  const { projects, selectedProject } = useStore()
  const [templateCount, setTemplateCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!selectedProject) {
      setTemplateCount(null)
      return
    }
    setTemplateCount(null)
    listTemplates(selectedProject._id)
      .then((t) => {
        if (!cancelled) setTemplateCount(t.length)
      })
      .catch((err) => {
        if (!cancelled && err instanceof ApiError) setTemplateCount(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedProject])

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="At-a-glance view of your communication projects."
      />

      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Projects</div>
          <div class="stat-value">{projects.length}</div>
          <div class="stat-hint">Across this workspace</div>
        </div>
        <div class="stat">
          <div class="stat-label">Templates</div>
          <div class="stat-value">{templateCount ?? '—'}</div>
          <div class="stat-hint">
            {selectedProject ? `In ${selectedProject.name}` : 'Select a project'}
          </div>
        </div>
        <div class="stat">
          <div class="stat-label">Sends (24h)</div>
          <div class="stat-value">—</div>
          <div class="stat-hint">No stats endpoint yet</div>
        </div>
        <div class="stat">
          <div class="stat-label">Delivery rate</div>
          <div class="stat-value">—</div>
          <div class="stat-hint">No stats endpoint yet</div>
        </div>
      </div>

      <div class="section-title">
        Recent sends
        <span class="placeholder-tag">Placeholder</span>
      </div>
      <div class="card">
        <p class="subtle" style={{ margin: '0 0 14px' }}>
          Aggregate send activity isn't available from the API yet. For real send
          history, open{' '}
          <a class="mono" style={{ color: 'var(--accent-ink)' }} href="/logs" onClick={(e) => { e.preventDefault(); route('/logs') }}>
            Notification Logs
          </a>
          .
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Template</th>
                <th>Channel</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              <tr class="state-row">
                <td colSpan={5}>Sample data — wire to a real stats endpoint once it exists.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
