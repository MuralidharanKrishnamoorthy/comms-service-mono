import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { ApiError, API_BASE, createCategory, listCategories, listTemplates } from '../api'
import type { Category, Template } from '../types'
import { ApiBanner, Dropdown, Modal, PageHeader } from '../components/ui'
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

export function Categories(_props: { path?: string }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

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
              <div class="cat-card-arrow-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M7 17L17 7M9 7h8v8" />
                </svg>
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
    </div>
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
