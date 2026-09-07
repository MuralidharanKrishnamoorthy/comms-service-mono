import { useEffect, useState } from 'preact/hooks'
import { useAuth } from '../auth'
import {
  ApiError,
  API_BASE,
  createApiKey,
  listApiKeys,
  revealApiKey,
  revokeApiKey,
} from '../api'
import type { ApiKeyRow, CreatedApiKey } from '../types'
import { ApiBanner, Dropdown, Modal, StatusBadge } from './ui'
import { formatDate } from '../util'

export function ApiKeysPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [creating, setCreating] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = () => {
    setLoading(true)
    setUnreachable(false)
    listApiKeys(projectId)
      .then(setKeys)
      .catch((err) => {
        if (err instanceof ApiError && err.isNetwork) setUnreachable(true)
        setKeys([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [projectId])

  const isOwner = (k: ApiKeyRow) => user?.id === k.created_by
  const canRevoke = (k: ApiKeyRow) =>
    k.status === 'active' && (user?.role === 'admin' || isOwner(k))

  // Copy: fetch the value FRESH each click (owner-only endpoint); never cache it
  // beyond the clipboard write.
  const copy = async (k: ApiKeyRow) => {
    setBanner(null)
    setBusyId(k._id)
    try {
      const { value } = await revealApiKey(projectId, k._id)
      await navigator.clipboard.writeText(value)
      setCopiedId(k._id)
      setTimeout(() => setCopiedId((c) => (c === k._id ? null : c)), 2000)
    } catch (err) {
      if (err instanceof ApiError) setBanner(err.message)
      else setBanner('Could not copy the key.')
    } finally {
      setBusyId(null)
    }
  }

  const revoke = async (k: ApiKeyRow) => {
    if (!confirm(`Revoke "${k.name}"? Any app using this key will stop working immediately.`)) return
    setBanner(null)
    setBusyId(k._id)
    try {
      await revokeApiKey(projectId, k._id)
      refresh()
    } catch (err) {
      if (err instanceof ApiError) setBanner(err.message)
      else setBanner('Could not revoke the key.')
      setBusyId(null)
    }
  }

  return (
    <div class="card" style={{ marginTop: 18 }}>
      <div class="page-head" style={{ marginBottom: 14 }}>
        <div>
          <h2 class="section-title" style={{ margin: 0 }}>
            API keys
          </h2>
          <p class="subtle" style={{ margin: '2px 0 0' }}>
            Each key is owned by whoever created it. You can only copy keys you created.
          </p>
        </div>
        {/* Any project member can generate a key — no role gate. */}
        <button class="btn btn-primary" onClick={() => setCreating(true)}>
          + Generate key
        </button>
      </div>

      {banner && <div class="banner-error" style={{ marginBottom: 12 }}>{banner}</div>}
      {unreachable && <ApiBanner base={API_BASE} />}

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Created by</th>
              <th>Created</th>
              <th>Expires</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr class="state-row">
                <td colSpan={7}>Loading…</td>
              </tr>
            ) : unreachable ? (
              <tr class="state-row">
                <td colSpan={7}>Couldn't load keys.</td>
              </tr>
            ) : keys.length === 0 ? (
              <tr class="state-row">
                <td colSpan={7}>No keys yet — click Generate key to create one.</td>
              </tr>
            ) : (
              keys.map((k) => (
                <tr key={k._id}>
                  <td class="cell-primary">{k.name}</td>
                  <td>
                    <span class="mono">{k.prefix}…</span>
                  </td>
                  <td class="cell-muted">
                    {k.created_by_name}
                    {isOwner(k) && <span class="chip" style={{ marginLeft: 8 }}>you</span>}
                  </td>
                  <td class="cell-faint">{formatDate(k.created_at)}</td>
                  <td class="cell-faint">{k.expires_at ? formatDate(k.expires_at) : 'Never'}</td>
                  <td>
                    <StatusBadge status={k.status} />
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {/* Copy only on your own keys (the reveal endpoint is owner-only). */}
                    {isOwner(k) && k.status === 'active' && (
                      <button
                        class="btn btn-sm"
                        disabled={busyId === k._id}
                        onClick={() => copy(k)}
                      >
                        {copiedId === k._id ? '✓ Copied' : 'Copy'}
                      </button>
                    )}
                    {canRevoke(k) && (
                      <button
                        class="btn btn-sm btn-danger"
                        style={{ marginLeft: 8 }}
                        disabled={busyId === k._id}
                        onClick={() => revoke(k)}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <GenerateKeyModal
          projectId={projectId}
          onClose={() => {
            setCreating(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

const EXPIRY_CHOICES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '180 days' },
  { days: 365, label: '365 days' },
]

function GenerateKeyModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [name, setName] = useState('')
  // '' = nothing picked yet. Deliberately no default: an expiry is a real
  // decision, not something to inherit silently.
  const [expiresInDays, setExpiresInDays] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [expiryError, setExpiryError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [copied, setCopied] = useState(false)

  const submit = async (e: Event) => {
    e.preventDefault()
    setBanner(null)
    const trimmed = name.trim()
    // Validate both fields together, so a user missing both sees both errors
    // at once rather than fixing one and being told about the next.
    const missingName = !trimmed
    const missingExpiry = !expiresInDays
    setNameError(missingName ? 'A key name is required.' : null)
    setExpiryError(missingExpiry ? 'Choose when this key should expire.' : null)
    if (missingName || missingExpiry) return

    setSubmitting(true)
    try {
      const result = await createApiKey(projectId, trimmed, Number(expiresInDays))
      setCreated(result)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isNetwork) setBanner(`Can't reach the API at ${API_BASE} — is the backend running?`)
        else if (err.status === 400) setNameError(err.details?.fieldErrors?.name?.[0] ?? err.message)
        else setBanner(err.message)
      } else setBanner('Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  const copyValue = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (created) {
    return (
      <Modal title="Key created" onClose={onClose} width={520}>
        <p style={{ marginTop: 0 }}>
          <strong>{created.name}</strong> is ready. Here's its value:
        </p>
        <div class="key-reveal">
          <span class="mono">{created.value}</span>
          <button class="btn btn-sm" onClick={copyValue}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <div class="note">
          You can copy this key again anytime from the API keys list on this page —
          but only you (its creator) can. Store it in your app's environment.
          {created.expires_at && (
            <>
              {' '}
              It expires on <strong>{formatDate(created.expires_at)}</strong> — generate a
              replacement before then.
            </>
          )}
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Generate API key" onClose={onClose}>
      {banner && <div class="banner-error">{banner}</div>}
      <form onSubmit={submit}>
        <div class="field">
          <label for="key-name">
            Key name <span class="hint">(e.g. "Sam's key", "Staging")</span>
          </label>
          <input
            id="key-name"
            type="text"
            value={name}
            autoFocus
            placeholder="My key"
            class={nameError ? 'invalid' : ''}
            onInput={(e) => {
              setName((e.target as HTMLInputElement).value)
              setNameError(null)
            }}
          />
          {nameError && <div class="field-error">{nameError}</div>}
        </div>
        <div class="field">
          {/* No `for` — Dropdown renders a button, not a labelable control
              (same as the filter labels in Logs). */}
          <label>Expires in</label>
          <Dropdown
            value={expiresInDays}
            onChange={(v) => {
              setExpiresInDays(v)
              setExpiryError(null)
            }}
            placeholder="Choose an expiry"
            class={expiryError ? 'invalid' : ''}
            options={EXPIRY_CHOICES.map((c) => ({ value: String(c.days), label: c.label }))}
          />
          {expiryError && <div class="field-error">{expiryError}</div>}
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {submitting ? 'Generating…' : 'Generate key'}
          </button>
          <button type="button" class="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
