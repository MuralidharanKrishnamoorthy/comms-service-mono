import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { ApiError, API_BASE, createCategory, listCategories } from '../api'
import type { Category } from '../types'
import { ApiBanner, Modal, PageHeader } from '../components/ui'

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
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

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
      await createCategory(trimmed)
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
    <Modal title="New category" onClose={onClose}>
      {banner && <div class="banner-error">{banner}</div>}
      <form onSubmit={submit}>
        <div class="field">
          <label for="cat-name">
            Category name <span class="hint">(1–60 characters)</span>
          </label>
          <input
            id="cat-name"
            type="text"
            value={name}
            autoFocus
            placeholder="e.g. Marketing"
            class={nameError ? 'invalid' : ''}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          {nameError && <div class="field-error">{nameError}</div>}
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create category'}
          </button>
          <button type="button" class="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
