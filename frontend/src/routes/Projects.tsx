import { useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiError, createProject } from '../api'
import type { CreatedProject } from '../types'
import {
  ApiBanner,
  ChannelChips,
  Modal,
  PageHeader,
  StatusBadge,
} from '../components/ui'
import { formatDate } from '../util'
import { API_BASE } from '../api'

export function Projects(_props: { path?: string }) {
  const { projects, projectsLoading, projectsUnreachable, refreshProjects, setSelectedProjectId } =
    useStore()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Each project gets its own API key and message templates."
        actions={
          <button class="btn btn-primary" onClick={() => setModalOpen(true)}>
            + Generate Key
          </button>
        }
      />

      {projectsUnreachable && <ApiBanner base={API_BASE} />}

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Key prefix</th>
              <th>Channels</th>
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
                <td colSpan={5}>No projects yet — click Generate Key to create one.</td>
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
                    <span class="mono">{p.api_key_prefix}…</span>
                  </td>
                  <td>
                    <ChannelChips channels={p.channels_allowed} />
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
          onCreated={async (created) => {
            await refreshProjects()
            setSelectedProjectId(created.id)
          }}
        />
      )}
    </div>
  )
}

// Two-step modal: (1) name → POST /projects, (2) reveal api_key once.
function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (created: CreatedProject) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedProject | null>(null)
  const [copied, setCopied] = useState(false)

  const validate = (): boolean => {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Project name is required.')
      return false
    }
    if (trimmed.length > 100) {
      setNameError('Project name must be 100 characters or fewer.')
      return false
    }
    setNameError(null)
    return true
  }

  const submit = async (e: Event) => {
    e.preventDefault()
    setBanner(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      const result = await createProject(name.trim())
      setCreated(result)
      await onCreated(result)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isNetwork) {
          setBanner(`Can't reach the API at ${API_BASE} — is the backend running?`)
        } else if (err.status === 400) {
          const fieldMsg = err.details?.fieldErrors?.name?.[0]
          setNameError(fieldMsg ?? err.message)
        } else {
          setBanner(err.message)
        }
      } else {
        setBanner('Something went wrong.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const copyKey = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.api_key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  // ----- Step 2: reveal key -----
  if (created) {
    return (
      <Modal title="Project created" onClose={onClose} width={520}>
        <p style={{ marginTop: 0 }}>
          <strong>{created.name}</strong> is ready. Copy its API key now —{' '}
          <strong>this is the only time it will be shown.</strong> It can't be
          retrieved again.
        </p>

        <label>API key</label>
        <div class="key-reveal">
          <span class="mono">{created.api_key}</span>
          <button class="btn btn-sm" onClick={copyKey}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        <div class="note">
          Store this in the consuming app's environment now.
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    )
  }

  // ----- Step 1: name -----
  return (
    <Modal title="Generate a new project key" onClose={onClose}>
      {banner && <div class="banner-error">{banner}</div>}
      <form onSubmit={submit}>
        <div class="field">
          <label for="proj-name">
            Project name <span class="hint">(1–100 characters)</span>
          </label>
          <input
            id="proj-name"
            type="text"
            value={name}
            autoFocus
            placeholder="e.g. Krediq"
            class={nameError ? 'invalid' : ''}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          {nameError && <div class="field-error">{nameError}</div>}
        </div>
        <p class="subtle" style={{ marginTop: 0 }}>
          A key is generated automatically and shown once on the next step.
        </p>
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
