import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import {
  ApiError,
  API_BASE,
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  listTemplates,
  updateCategory,
} from '../api'
import type { Category, Template } from '../types'
import {
  ApiBanner,
  ConfirmDialog,
  Dropdown,
  Modal,
  PageHeader,
  PencilIcon,
  TrashIcon,
} from '../components/ui'
import { useStore } from '../store'

const PALETTE = ['amber', 'terracotta', 'gold', 'sienna', 'copper', 'umber']
function paletteFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  )
}

export function Categories(_props: { path?: string }) {
  const { projects } = useStore()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const [projectFilter, setProjectFilter] = useState('')

  const load = () => {
    setLoading(true)
    setUnreachable(false)
    listCategories()
      .then(setCategories)
      .catch((err) => {
        if (err instanceof ApiError && err.isNetwork) setUnreachable(true)
        setCategories([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const confirmDelete = async (cat: Category) => {
    setBanner(null)
    setBusy(true)
    try {
      await deleteCategory(cat._id)
      setDeleting(null)
      load()
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : 'Could not delete the category.')
      setDeleting(null)
    } finally {
      setBusy(false)
    }
  }

  const visible = projectFilter
    ? categories.filter((cat) => cat.templates?.some((t) => t.project_id === projectFilter))
    : categories
  const filteredProjectName = projects.find((p) => p._id === projectFilter)?.name

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Group templates from any project."
        actions={
          <button class="btn btn-primary" onClick={() => setModalOpen(true)}>
            + New category
          </button>
        }
      />

      {banner && <div class="banner-error" style={{ marginBottom: 12 }}>{banner}</div>}
      {unreachable && <ApiBanner base={API_BASE} />}

      <div class="toolbar">
        <div class="field toolbar-field" style={{ minWidth: 240 }}>
          <label>Project</label>
          <Dropdown
            value={projectFilter}
            onChange={setProjectFilter}
            onClear={() => setProjectFilter('')}
            options={[
              { value: '', label: 'All projects' },
              ...projects.map((p) => ({ value: p._id, label: p.name })),
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div class="empty">Loading…</div>
      ) : categories.length === 0 ? (
        <div class="empty">No categories yet — click New category to create one.</div>
      ) : visible.length === 0 ? (
        <div class="empty">
          No categories hold a template from {filteredProjectName ?? 'this project'} yet.
        </div>
      ) : (
        <div class="cat-card-grid">
          {visible.map((cat) => (
            <div
              key={cat._id}
              class={`cat-card cat-accent-${paletteFor(cat.name)}`}
              onClick={() => route(`/categories/${cat._id}`)}
            >
              <div class="cat-card-icon">
                <FolderIcon />
              </div>
              <div class="cat-card-body">
                <div class="cat-card-name">{cat.name}</div>

                <div class="cat-card-count">
                  {(() => {
                    if (!projectFilter) {
                      return `${cat.template_count} ${cat.template_count === 1 ? 'template' : 'templates'}`
                    }
                    const here = cat.templates.filter((t) => t.project_id === projectFilter).length
                    return `${here} of ${cat.template_count} ${cat.template_count === 1 ? 'template' : 'templates'}`
                  })()}
                </div>
              </div>

              <div class="cat-card-actions">
                <button
                  type="button"
                  class="cat-card-action"
                  title="Edit category"
                  aria-label={`Edit ${cat.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditing(cat)
                  }}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  class="cat-card-action danger"
                  title="Delete category"
                  aria-label={`Delete ${cat.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleting(cat)
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <CreateCategoryModal
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false)
            load()
          }}
        />
      )}

      {editing && (
        <EditCategoryModal
          category={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete category"
          danger
          confirmLabel="Delete category"
          busy={busy}
          message={
            <>
              Delete <strong>{deleting.name}</strong>?
              {deleting.template_count > 0 && (
                <>
                  {' '}
                  Its {deleting.template_count}{' '}
                  {deleting.template_count === 1 ? 'template' : 'templates'} will be
                  ungrouped — the templates themselves are not deleted.
                </>
              )}{' '}
              This can't be undone.
            </>
          }
          onConfirm={() => confirmDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

type Pick = { project_id: string; template_key: string }
const samePick = (a: Pick, b: Pick) =>
  a.project_id === b.project_id && a.template_key === b.template_key

/**
 * The one place a category is edited: its name and its templates together.
 *
 * `selection` holds the COMPLETE desired attachment set across every project,
 * seeded from what's currently attached. Switching the project dropdown only
 * changes which candidates are listed — it never touches selections made for
 * another project, which is what lets one save span several projects.
 */
function EditCategoryModal({
  category,
  onClose,
  onSaved,
}: {
  category: Category
  onClose: () => void
  onSaved: () => void
}) {
  const { projects, selectedProjectId } = useStore()
  const [name, setName] = useState(category.name)
  const [projectId, setProjectId] = useState(selectedProjectId ?? projects[0]?._id ?? '')
  const [selection, setSelection] = useState<Pick[]>([])
  const [candidates, setCandidates] = useState<Template[]>([])
  const [loadingAttached, setLoadingAttached] = useState(true)
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Seed the selection from what's attached right now, across all projects.
  useEffect(() => {
    let cancelled = false
    getCategory(category._id)
      .then((data) => {
        if (cancelled) return
        setSelection(
          data.attached.map((a) => ({ project_id: a.project_id, template_key: a.template_key }))
        )
        // Open on a project this category actually uses, rather than whatever
        // happens to be picked in the top bar — otherwise editing a category
        // full of one project's templates opens on an unrelated project with
        // nothing ticked. Runs once per category, so a manual switch after
        // this sticks.
        const attachedProjects = data.attached.map((a) => a.project_id)
        if (attachedProjects.length > 0 && !attachedProjects.includes(projectId)) {
          setProjectId(attachedProjects[0])
        }
        if (data.hidden_count > 0) {
          setBanner(
            `${data.hidden_count} template(s) in projects you can't access are attached and can't be edited here.`
          )
        }
      })
      .catch(() => {
        if (!cancelled) setBanner('Could not load the current templates.')
      })
      .finally(() => {
        if (!cancelled) setLoadingAttached(false)
      })
    return () => {
      cancelled = true
    }
  }, [category._id])

  useEffect(() => {
    if (!projectId) {
      setCandidates([])
      return
    }
    let cancelled = false
    setLoadingCandidates(true)
    listTemplates(projectId)
      .then((rows) => {
        if (!cancelled) setCandidates(rows)
      })
      .catch(() => {
        if (!cancelled) setCandidates([])
      })
      .finally(() => {
        if (!cancelled) setLoadingCandidates(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const toggle = (templateKey: string) => {
    const entry = { project_id: projectId, template_key: templateKey }
    setSelection((rows) =>
      rows.some((r) => samePick(r, entry))
        ? rows.filter((r) => !samePick(r, entry))
        : [...rows, entry]
    )
  }

  const submit = async (e: Event) => {
    e.preventDefault()
    setBanner(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Category name is required.')
      return
    }
    setNameError(null)
    setSubmitting(true)
    try {
      await updateCategory(category._id, { name: trimmed, templates: selection })
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isNetwork) setBanner(`Can't reach the API at ${API_BASE} — is the backend running?`)
        else if (err.status === 409) setNameError(err.message)
        else setBanner(err.message)
      } else {
        setBanner('Something went wrong.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const pickedHere = selection.filter((s) => s.project_id === projectId).length

  return (
    <Modal title="Edit category" onClose={onClose} width={520}>
      {banner && <div class="banner-error">{banner}</div>}
      <form onSubmit={submit}>
        <div class="field">
          <label for="cat-edit-name">
            Category name <span class="hint">(stored in capitals)</span>
          </label>
          <input
            id="cat-edit-name"
            type="text"
            value={name}
            autoFocus
            class={nameError ? 'invalid' : ''}
            onInput={(e) => {
              setName((e.target as HTMLInputElement).value.toUpperCase())
              setNameError(null)
            }}
          />
          {nameError && <div class="field-error">{nameError}</div>}
        </div>

        <div class="field">
          <label>
            Templates{' '}
            <span class="hint">
              {selection.length} selected{pickedHere !== selection.length && ` · ${pickedHere} here`}
            </span>
          </label>
          {projects.length === 0 ? (
            <p class="subtle" style={{ margin: 0 }}>No projects exist yet.</p>
          ) : (
            <Dropdown
              value={projectId}
              onChange={setProjectId}
              options={projects.map((p) => ({ value: p._id, label: p.name }))}
              placeholder="Choose a project"
            />
          )}
        </div>

        {projectId && (
          <div class="field">
            {loadingAttached || loadingCandidates ? (
              <p class="subtle" style={{ margin: 0 }}>Loading templates…</p>
            ) : candidates.length === 0 ? (
              <p class="subtle" style={{ margin: 0 }}>This project has no templates yet.</p>
            ) : (
              <div class="checkbox-list">
                {candidates.map((t) => (
                  <label key={t._id} class="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selection.some((s) =>
                        samePick(s, { project_id: projectId, template_key: t.template_key })
                      )}
                      onChange={() => toggle(t.template_key)}
                    />
                    {t.name} <span class="mono subtle">{t.template_key}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={submitting || loadingAttached}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" class="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CreateCategoryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { projects } = useStore()
  const [name, setName] = useState('')
  // Starts empty on purpose: a new category picks its own project rather than
  // inheriting the top bar's, so nothing is added by default. Adding templates
  // is optional — a category can be created with none and filled in later.
  const [projectId, setProjectId] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  // Reload the template list whenever the chosen project changes. Selections
  // are cleared with it — a template_key only means something within one
  // project, so carrying them across would attach the wrong templates.
  useEffect(() => {
    if (!projectId) {
      setTemplates([])
      return
    }
    let cancelled = false
    setTemplatesLoading(true)
    setPicked([])
    listTemplates(projectId)
      .then((rows) => {
        if (!cancelled) setTemplates(rows)
      })
      .catch(() => {
        if (!cancelled) setTemplates([])
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const toggle = (templateKey: string) =>
    setPicked((keys) =>
      keys.includes(templateKey) ? keys.filter((k) => k !== templateKey) : [...keys, templateKey]
    )

  const submit = async (e: Event) => {
    e.preventDefault()
    setBanner(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Category name is required.')
      return
    }
    if (trimmed.length > 60) {
      setNameError('Category name must be 60 characters or fewer.')
      return
    }
    setNameError(null)
    setSubmitting(true)
    try {
      await createCategory(
        trimmed,
        picked.map((template_key) => ({ project_id: projectId, template_key }))
      )
      onCreated()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isNetwork) setBanner(`Can't reach the API at ${API_BASE} — is the backend running?`)
        else if (err.status === 409) setNameError(err.message)
        else setBanner(err.message)
      } else {
        setBanner('Something went wrong.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="New category" onClose={onClose} width={520}>
      {banner && <div class="banner-error">{banner}</div>}
      <form onSubmit={submit}>
        <div class="field">
          <label for="cat-name">
            Category name <span class="hint">(stored in capitals)</span>
          </label>
          <input
            id="cat-name"
            type="text"
            value={name}
            autoFocus
            placeholder="e.g. MARKETING"
            class={nameError ? 'invalid' : ''}

            onInput={(e) => {
              setName((e.target as HTMLInputElement).value.toUpperCase())
              setNameError(null)
            }}
          />
          {nameError && <div class="field-error">{nameError}</div>}
        </div>

        <div class="field">
          <label>
            Add projects <span class="hint">(optional — you can add more later)</span>
          </label>
          {projects.length === 0 ? (
            <p class="subtle" style={{ margin: 0 }}>No projects exist yet.</p>
          ) : (
            <Dropdown
              value={projectId}
              onChange={setProjectId}
              options={projects.map((p) => ({ value: p._id, label: p.name }))}
              placeholder="Choose a project"
            />
          )}
        </div>

        {projectId && (
          <div class="field">
            {templatesLoading ? (
              <p class="subtle" style={{ margin: 0 }}>Loading templates…</p>
            ) : templates.length === 0 ? (
              <p class="subtle" style={{ margin: 0 }}>This project has no templates yet.</p>
            ) : (
              <div class="checkbox-list">
                {templates.map((t) => (
                  <label key={t._id} class="checkbox-row">
                    <input
                      type="checkbox"
                      checked={picked.includes(t.template_key)}
                      onChange={() => toggle(t.template_key)}
                    />
                    {t.name} <span class="mono subtle">{t.template_key}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {submitting
              ? 'Creating…'
              : picked.length > 0
                ? `Create with ${picked.length} template${picked.length === 1 ? '' : 's'}`
                : 'Create category'}
          </button>
          <button type="button" class="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
