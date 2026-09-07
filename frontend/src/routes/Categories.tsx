import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import {
  ApiError,
  API_BASE,
  createCategory,
  deleteCategory,
  listCategories,
  listTemplates,
  updateCategory,
} from '../api'
import type { Category, Template } from '../types'
import { ApiBanner, ConfirmDialog, Dropdown, Modal, PageHeader } from '../components/ui'
import { useStore } from '../store'

// Deterministic accent per category, so the same name always gets the same
// color across reloads without persisting anything.
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

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export function Categories(_props: { path?: string }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [renaming, setRenaming] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

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

      {loading ? (
        <div class="empty">Loading…</div>
      ) : categories.length === 0 ? (
        <div class="empty">No categories yet — click New category to create one.</div>
      ) : (
        <div class="cat-card-grid">
          {categories.map((cat) => (
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
                  {cat.template_count} {cat.template_count === 1 ? 'template' : 'templates'}
                </div>
              </div>
              {/* Icon buttons, not text: the grid's columns bottom out at
                  240px and "Rename"/"Delete" labels don't fit beside the name.
                  stopPropagation on each — the whole card navigates, and these
                  must not trigger that. */}
              <div class="cat-card-actions">
                <button
                  type="button"
                  class="cat-card-action"
                  title="Rename category"
                  aria-label={`Rename ${cat.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setRenaming(cat)
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

      {renaming && (
        <RenameCategoryModal
          category={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={() => {
            setRenaming(null)
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

function RenameCategoryModal({
  category,
  onClose,
  onRenamed,
}: {
  category: Category
  onClose: () => void
  onRenamed: () => void
}) {
  const [name, setName] = useState(category.name)
  const [nameError, setNameError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: Event) => {
    e.preventDefault()
    setBanner(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Category name is required.')
      return
    }
    if (trimmed === category.name) {
      onClose()
      return
    }
    setNameError(null)
    setSubmitting(true)
    try {
      await updateCategory(category._id, trimmed)
      onRenamed()
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
    <Modal title="Rename category" onClose={onClose}>
      {banner && <div class="banner-error">{banner}</div>}
      <form onSubmit={submit}>
        <div class="field">
          <label for="cat-rename">
            Category name <span class="hint">(stored in capitals)</span>
          </label>
          <input
            id="cat-rename"
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
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save name'}
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
  const { projects, selectedProjectId } = useStore()
  const [name, setName] = useState('')
  // Pre-selected from the top bar, so the common case ("group templates from
  // the project I'm already looking at") costs zero extra clicks.
  const [projectId, setProjectId] = useState(selectedProjectId ?? projects[0]?._id ?? '')
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
            // Upper-cased as you type, so the field shows exactly what gets
            // stored. The server upper-cases too — this is only the preview.
            onInput={(e) => {
              setName((e.target as HTMLInputElement).value.toUpperCase())
              setNameError(null)
            }}
          />
          {nameError && <div class="field-error">{nameError}</div>}
        </div>

        <div class="field">
          <label>
            Add templates <span class="hint">(optional — you can add more later)</span>
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
