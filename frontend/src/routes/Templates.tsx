import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiError, API_BASE, listTemplates } from '../api'
import type { Template } from '../types'
import { ApiBanner, ChannelChips, Dropdown, PageHeader } from '../components/ui'
import { enabledChannels, formatDate } from '../util'

export function Templates(_props: { path?: string }) {
  const { projects, selectedProjectId, selectedProject, setSelectedProjectId } = useStore()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)

  useEffect(() => {
    if (!selectedProject) {
      setLoading(false)
      return
    }
    const pid = selectedProject._id
    let cancelled = false
    setLoading(true)
    setUnreachable(false)

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

  const visible = templates

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
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Template</th>
              <th>Channels</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr class="state-row">
                <td colSpan={3}>Loading…</td>
              </tr>
            ) : unreachable ? (
              <tr class="state-row">
                <td colSpan={3}>Couldn't load templates.</td>
              </tr>
            ) : visible.length === 0 ? (
              <tr class="state-row">
                <td colSpan={3}>No templates yet — click New template to create one.</td>
              </tr>
            ) : (
              visible.map((t) => (
                <tr
                  key={t._id}
                  class="clickable"
                  onClick={() => route(`/templates/${t.template_key}`)}
                >
                  <td>
                    <div class="cell-primary">{t.name}</div>
                    <div class="cell-secondary mono">{t.template_key}</div>
                  </td>
                  <td>
                    <ChannelChips channels={enabledChannels(t.channels ?? {})} />
                  </td>
                  <td class="cell-faint">{formatDate(t.updated_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
