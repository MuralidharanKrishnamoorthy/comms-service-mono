import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiError, API_BASE, getProject } from '../api'
import type { Project } from '../types'
import { ApiBanner, BackLink, ChannelChips, StatusBadge } from '../components/ui'
import { formatDate } from '../util'

export function ProjectDetail({ id }: { path?: string; id?: string }) {
  const { setSelectedProjectId } = useStore()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setUnreachable(false)
    setNotFound(false)

    getProject(id)
      .then((p) => {
        if (cancelled) return
        setProject(p)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError) {
          if (err.isNetwork) setUnreachable(true)
          else if (err.status === 404) setNotFound(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  const goTo = (path: string) => {
    if (id) setSelectedProjectId(id)
    route(path)
  }

  const copyKey = async () => {
    if (!project?.api_key) return
    try {
      await navigator.clipboard.writeText(project.api_key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div>
      <BackLink href="/projects" label="Back to projects" onClick={() => route('/projects')} />

      {unreachable && <ApiBanner base={API_BASE} />}

      {loading ? (
        <div class="card">Loading…</div>
      ) : notFound || !project ? (
        <div class="card">
          <p style={{ margin: 0 }}>
            Project not found —{' '}
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

              <dt>API key</dt>
              <dd>
                <div class="key-reveal">
                  <span class="mono">{project.api_key}</span>
                  <button class="btn btn-sm" onClick={copyKey}>
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
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
        </>
      )}
    </div>
  )
}
