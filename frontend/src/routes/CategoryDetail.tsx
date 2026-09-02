import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import {
  ApiError,
  API_BASE,
  attachTemplateToCategory,
  detachTemplateFromCategory,
  getCategoryTemplates,
} from '../api'
import type { Category, TemplateWithAttached } from '../types'
import { ApiBanner, BackLink, ChannelChips, Dropdown, PageHeader } from '../components/ui'
import { enabledChannels } from '../util'

export function CategoryDetail({ categoryId }: { path?: string; categoryId?: string }) {
  const { projects, selectedProjectId, selectedProject, setSelectedProjectId } = useStore()
  const [category, setCategory] = useState<Category | null>(null)
  const [templates, setTemplates] = useState<TemplateWithAttached[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [notFound, setNotFound] = useState(false)
  // Template keys currently mid-request, so their toggle can show a disabled/pending state.
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedProject || !categoryId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setUnreachable(false)
    setNotFound(false)

    getCategoryTemplates(categoryId, selectedProject._id)
      .then(({ category, templates }) => {
        if (cancelled) return
        setCategory(category)
        setTemplates(templates)
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
  }, [selectedProject, categoryId])

  const toggle = async (t: TemplateWithAttached) => {
    if (!selectedProject || !categoryId) return
    setPending((p) => new Set(p).add(t.template_key))
    try {
      if (t.attached) {
        await detachTemplateFromCategory(categoryId, selectedProject._id, t.template_key)
      } else {
        await attachTemplateToCategory(categoryId, selectedProject._id, t.template_key)
      }
      setTemplates((prev) =>
        prev.map((x) => (x.template_key === t.template_key ? { ...x, attached: !x.attached } : x))
      )
    } catch {
      // Leave state unchanged on failure — the button just stays as it was.
    } finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(t.template_key)
        return next
      })
    }
  }

  return (
    <div>
      <BackLink href="/categories" label="Back to categories" onClick={() => route('/categories')} />

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

      {!selectedProject ? (
        <div class="empty">Select a project above.</div>
      ) : loading ? (
        <div class="empty">Loading…</div>
      ) : notFound || !category ? (
        <div class="card">Category not found.</div>
      ) : (
        <>
          <PageHeader title={category.name} subtitle={`${templates.filter((t) => t.attached).length} template(s) attached.`} />

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Channels</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr class="state-row">
                    <td colSpan={3}>No templates in this project yet.</td>
                  </tr>
                ) : (
                  templates.map((t) => (
                    <tr key={t._id}>
                      <td>
                        <div class="cell-primary">{t.name}</div>
                        <div class="cell-secondary mono">{t.template_key}</div>
                      </td>
                      <td>
                        <ChannelChips channels={enabledChannels(t.channels ?? {})} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          class={`attach-toggle ${t.attached ? 'attached' : ''}`}
                          disabled={pending.has(t.template_key)}
                          onClick={() => toggle(t)}
                          title={t.attached ? 'Remove from category' : 'Attach to category'}
                        >
                          {t.attached ? '✓ Attached' : '+ Attach'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
