import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import {
  ApiError,
  API_BASE,
  attachTemplateToCategory,
  detachTemplateFromCategory,
  getCategory,
  getCategoryTemplates,
} from '../api'
import type { AttachedTemplateRow, TemplateWithAttached } from '../types'
import { ApiBanner, BackLink, ChannelChips, Dropdown, PageHeader } from '../components/ui'
import { enabledChannels } from '../util'

export function CategoryDetail({ categoryId }: { path?: string; categoryId?: string }) {
  const { projects, selectedProjectId, setSelectedProjectId } = useStore()

  // What's in the category — loaded straight from the category, so it shows
  // every project's templates without asking which project to look at first.
  const [name, setName] = useState('')
  const [attached, setAttached] = useState<AttachedTemplateRow[]>([])
  const [hiddenCount, setHiddenCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [notFound, setNotFound] = useState(false)

  // The "add more" panel — this is the only place a project needs choosing,
  // because it browses candidates that aren't in the category yet.
  const [adding, setAdding] = useState(false)
  const [candidates, setCandidates] = useState<TemplateWithAttached[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)

  // template_ids mid-request, so their button can show a pending state.
  const [pending, setPending] = useState<Set<string>>(new Set())

  const loadCategory = () => {
    if (!categoryId) return
    setLoading(true)
    setUnreachable(false)
    setNotFound(false)
    getCategory(categoryId)
      .then((data) => {
        setName(data.category.name)
        setAttached(data.attached)
        setHiddenCount(data.hidden_count)
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          if (err.isNetwork) setUnreachable(true)
          else if (err.status === 404) setNotFound(true)
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(loadCategory, [categoryId])

  // Candidate list for the add panel, refreshed whenever it opens or the
  // chosen project changes.
  useEffect(() => {
    if (!adding || !categoryId || !selectedProjectId) return
    let cancelled = false
    setCandidatesLoading(true)
    getCategoryTemplates(categoryId, selectedProjectId)
      .then(({ templates }) => {
        if (!cancelled) setCandidates(templates)
      })
      .catch(() => {
        if (!cancelled) setCandidates([])
      })
      .finally(() => {
        if (!cancelled) setCandidatesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [adding, categoryId, selectedProjectId])

  const withPending = async (key: string, fn: () => Promise<unknown>) => {
    setPending((p) => new Set(p).add(key))
    try {
      await fn()
    } finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(key)
        return next
      })
    }
  }

  const detach = (row: AttachedTemplateRow) =>
    withPending(row.template_id, async () => {
      if (!categoryId) return
      try {
        await detachTemplateFromCategory(categoryId, row.project_id, row.template_key)
        setAttached((rows) => rows.filter((r) => r.template_id !== row.template_id))
        if (adding) {
          setCandidates((rows) =>
            rows.map((t) => (t.template_key === row.template_key ? { ...t, attached: false } : t))
          )
        }
      } catch {
        // Leave the row in place if the request failed.
      }
    })

  const attach = (t: TemplateWithAttached) =>
    withPending(t._id, async () => {
      if (!categoryId || !selectedProjectId) return
      try {
        await attachTemplateToCategory(categoryId, selectedProjectId, t.template_key)
        setCandidates((rows) =>
          rows.map((x) => (x.template_key === t.template_key ? { ...x, attached: true } : x))
        )
        // Re-read so the attached list picks up the project name and channels
        // without this component having to assemble the row itself.
        loadCategory()
      } catch {
        // No optimistic flip on failure.
      }
    })

  if (loading) {
    return (
      <div>
        <BackLink href="/categories" label="Back to categories" onClick={() => route('/categories')} />
        <div class="empty">Loading…</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div>
        <BackLink href="/categories" label="Back to categories" onClick={() => route('/categories')} />
        <div class="card">Category not found.</div>
      </div>
    )
  }

  const total = attached.length + hiddenCount
  const subtitle =
    hiddenCount > 0
      ? `${attached.length} of ${total} templates — ${hiddenCount} in projects you can't access.`
      : `${attached.length} ${attached.length === 1 ? 'template' : 'templates'} attached.`

  return (
    <div>
      <BackLink href="/categories" label="Back to categories" onClick={() => route('/categories')} />

      {unreachable && <ApiBanner base={API_BASE} />}

      <PageHeader
        title={name}
        subtitle={subtitle}
        actions={
          !adding && (
            <button class="btn btn-primary" onClick={() => setAdding(true)}>
              + Add templates
            </button>
          )
        }
      />

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Template</th>
              <th>Project</th>
              <th>Channels</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {attached.length === 0 ? (
              <tr class="state-row">
                <td colSpan={4}>
                  Nothing in this category yet — use Add templates to put something in it.
                </td>
              </tr>
            ) : (
              attached.map((row) => (
                <tr key={row.template_id}>
                  <td>
                    <div class="cell-primary">{row.name}</div>
                    <div class="cell-secondary mono">{row.template_key}</div>
                  </td>
                  <td class="cell-muted">{row.project_name}</td>
                  <td>
                    <ChannelChips channels={enabledChannels(row.channels ?? {})} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      class="btn btn-sm btn-danger"
                      disabled={pending.has(row.template_id)}
                      onClick={() => detach(row)}
                      title="Remove from this category"
                    >
                      Detach
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {adding && (
        <div class="card" style={{ marginTop: 18 }}>
          <div class="page-head" style={{ marginBottom: 14 }}>
            <div>
              <h2 class="section-title" style={{ margin: 0 }}>
                Add templates
              </h2>
              <p class="subtle" style={{ margin: '2px 0 0' }}>
                Pick a project to browse its templates. A category can hold templates from
                any number of projects.
              </p>
            </div>
            <button class="btn" onClick={() => setAdding(false)}>
              Done
            </button>
          </div>

          <div class="field" style={{ maxWidth: 280 }}>
            <label>Project</label>
            <Dropdown
              disabled={projects.length === 0}
              placeholder="No projects yet"
              value={selectedProjectId ?? ''}
              onChange={setSelectedProjectId}
              options={projects.map((p) => ({ value: p._id, label: p.name }))}
            />
          </div>

          {!selectedProjectId ? (
            <p class="subtle" style={{ margin: 0 }}>Select a project to see its templates.</p>
          ) : candidatesLoading ? (
            <p class="subtle" style={{ margin: 0 }}>Loading templates…</p>
          ) : candidates.length === 0 ? (
            <p class="subtle" style={{ margin: 0 }}>This project has no templates yet.</p>
          ) : (
            <div class="table-wrap">
              <table>
                <tbody>
                  {candidates.map((t) => (
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
                          disabled={pending.has(t._id)}
                          onClick={() =>
                            t.attached
                              ? detach({
                                  template_id: t._id,
                                  template_key: t.template_key,
                                  name: t.name,
                                  channels: t.channels,
                                  project_id: selectedProjectId,
                                  project_name: '',
                                  attached_at: '',
                                })
                              : attach(t)
                          }
                          title={t.attached ? 'Remove from category' : 'Attach to category'}
                        >
                          {t.attached ? '✓ Attached' : '+ Attach'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
