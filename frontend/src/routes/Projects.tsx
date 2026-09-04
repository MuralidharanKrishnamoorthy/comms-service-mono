import { useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { ApiBanner, ChannelChips, Modal, PageHeader, StatusBadge } from '../components/ui'
import { formatDate } from '../util'
import { ApiError, API_BASE, createProject } from '../api'

export function Projects(_props: { path?: string }) {
  const { projects, projectsLoading, projectsUnreachable, refreshProjects, setSelectedProjectId } = useStore()
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Each project gets its own API key and message templates."
        actions={
          user?.role === 'admin' && (
            <button class="btn btn-primary" onClick={() => setModalOpen(true)}>
              + New project
            </button>
          )
        }
      />

      {projectsUnreachable && <ApiBanner base={API_BASE} />}

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Channels</th>
              <th>API keys</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {projectsLoading ? (
              <tr class="state-row">
                <td colSpan={5}>Loading…</td>
              </tr>
            ) : projectsUnreachable ? (
              <tr class="state-row">
                <td colSpan={5}>Couldn't load projects.</td>
              </tr>
            ) : projects.length === 0 ? (
              <tr class="state-row">
                <td colSpan={5}>No projects yet.</td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr
                  key={p._id}
                  class="clickable"
                  onClick={() => route(`/projects/${p._id}`)}
                >
                  <td class="cell-primary">{p.name}</td>
                  <td>
                    <ChannelChips channels={p.channels_allowed} />
                  </td>
                  <td class="cell-muted">
                    {p.active_key_count ?? 0} active
                  </td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td class="cell-faint">{formatDate(p.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <CreateProjectModal
          onClose={() => setModalOpen(false)}
          onCreated={(id) => {
            setModalOpen(false)
            setSelectedProjectId(id)
            void refreshProjects()
            route(`/projects/${id}`)
          }}
        />
      )}
    </div>
  )
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const submit = async (e: Event) => {
    e.preventDefault()
    setBanner(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Project name is required.')
      return
    }
    if (trimmed.length > 60) {
      setNameError('Project name must be 60 characters or fewer.')
      return
    }
    setNameError(null)
    setSubmitting(true)
    try {
      const created = await createProject(trimmed)
      onCreated(created.id)
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
    <Modal title="New project" onClose={onClose}>
      {banner && <div class="banner-error">{banner}</div>}
      <form onSubmit={submit}>
        <div class="field">
          <label for="project-name">
            Project name <span class="hint">(1–60 characters)</span>
          </label>
          <input
            id="project-name"
            type="text"
            value={name}
            autoFocus
            placeholder="e.g. Acme Storefront"
            class={nameError ? 'invalid' : ''}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          {nameError && <div class="field-error">{nameError}</div>}
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create project'}
          </button>
          <button type="button" class="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
