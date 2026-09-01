import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiBanner, ChannelChips, StatusBadge } from '../components/ui'
import { formatDate } from '../util'
import { API_BASE } from '../api'

// There is no GET /projects/:id — this view is derived entirely from the row
// already fetched into the store by GET /projects.
export function ProjectDetail({ id }: { path?: string; id?: string }) {
  const { projects, projectsLoading, projectsUnreachable, setSelectedProjectId } = useStore()
  const project = projects.find((p) => p._id === id)

  const goTo = (path: string) => {
    if (id) setSelectedProjectId(id)
    route(path)
  }

  return (
    <div>
      <a
        class="back-link"
        href="/projects"
        onClick={(e) => {
          e.preventDefault()
          route('/projects')
        }}
      >
        ← Back to projects
      </a>

      {projectsUnreachable && <ApiBanner base={API_BASE} />}

      {projectsLoading && !project ? (
        <div class="card">Loading…</div>
      ) : !project ? (
        <div class="card">
          <p style={{ margin: 0 }}>
            Project not found. It may have been created in another session —{' '}
            <a
              class="mono"
              style={{ color: 'var(--accent-ink)' }}
              href="/projects"
              onClick={(e) => {
                e.preventDefault()
                route('/projects')
              }}
            >
              back to projects
            </a>
            .
          </p>
        </div>
      ) : (
        <>
          <h1 class="page-title" style={{ marginBottom: 4 }}>
            {project.name}
          </h1>
          <p class="page-subtitle" style={{ marginBottom: 20 }}>
            Project details
          </p>

          <div class="card">
            <dl class="dl">
              <dt>Name</dt>
              <dd>{project.name}</dd>

              <dt>Key prefix</dt>
              <dd>
                <span class="mono">{project.api_key_prefix}…</span>
              </dd>

              <dt>Channels</dt>
              <dd>
                <ChannelChips channels={project.channels_allowed} />
              </dd>

              <dt>Status</dt>
              <dd>
                <StatusBadge status={project.status} />
              </dd>

              <dt>Created</dt>
              <dd class="cell-muted">{formatDate(project.created_at)}</dd>

              <dt>Updated</dt>
              <dd class="cell-muted">{formatDate(project.updated_at)}</dd>
            </dl>

            <div class="detail-links">
              <button class="btn" onClick={() => goTo('/templates')}>
                View templates
              </button>
              <button class="btn" onClick={() => goTo('/logs')}>
                View logs
              </button>
            </div>
          </div>

          <div class="note" style={{ marginTop: 16 }}>
            Lost the API key? There's no regenerate endpoint yet — the only current
            fix is to create a new project.
          </div>
        </>
      )}
    </div>
  )
}
