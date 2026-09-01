import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiError, API_BASE, listCategories, listTemplates } from '../api'
import type { Template } from '../types'
import { ApiBanner, ChannelChips, PageHeader } from '../components/ui'
import { formatDate } from '../util'

export function Templates(_props: { path?: string }) {
  const { projects, selectedProjectId, selectedProject, setSelectedProjectId } = useStore()
  const [templates, setTemplates] = useState<Template[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')

  useEffect(() => {
    if (!selectedProject) {
      setLoading(false)
      return
    }
    const pid = selectedProject._id
    let cancelled = false
    setLoading(true)
    setUnreachable(false)
    setCategoryFilter('')

    Promise.all([listTemplates(pid), listCategories(pid).catch(() => [])])
      .then(([tpls, cats]) => {
        if (cancelled) return
        setTemplates(tpls)
        setCategories(cats)
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

  const visible = categoryFilter
    ? templates.filter((t) => t.category === categoryFilter)
    : templates

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
          {projects.length === 0 ? (
            <select disabled>
              <option>No projects yet</option>
            </select>
          ) : (
            <select
              class="project-select"
              value={selectedProjectId ?? ''}
              onChange={(e) => setSelectedProjectId((e.target as HTMLSelectElement).value)}
            >
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div class="field toolbar-field">
          <label>Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Template</th>
              <th>Category</th>
              <th>Channels</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr class="state-row">
                <td colSpan={4}>Loading…</td>
              </tr>
            ) : unreachable ? (
              <tr class="state-row">
                <td colSpan={4}>Couldn't load templates.</td>
              </tr>
            ) : visible.length === 0 ? (
              <tr class="state-row">
                <td colSpan={4}>
                  {templates.length === 0
                    ? 'No templates yet — click New template to create one.'
                    : 'No templates in this category.'}
                </td>
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
                  <td class="cell-muted">{t.category}</td>
                  <td>
                    <ChannelChips channels={Object.keys(t.channels ?? {})} />
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
