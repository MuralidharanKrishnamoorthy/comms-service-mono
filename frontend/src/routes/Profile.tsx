import { useMemo, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useAuth } from '../auth'
import { ApiError, API_BASE, changeMyPassword } from '../api'
import { BackLink, PageHeader } from '../components/ui'
import { RoleBadge } from './UsersAccess'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

function pageName(path: string): string {
  if (path.startsWith('/admin/users')) return 'Users & Access'
  if (path.startsWith('/templates')) return 'Templates'
  if (path.startsWith('/categories')) return 'Categories'
  if (path.startsWith('/logs')) return 'Notification Logs'
  if (path.startsWith('/projects')) return 'Projects'
  return 'Projects'
}

export function Profile(_props: { path?: string }) {
  const { user, refreshUser } = useAuth()

  const from = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get('from')
    return raw && raw.startsWith('/') ? raw : '/projects'
  }, [])

  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (!user) return null

  const hasLength = newPassword.length >= 8
  const hasNumber = /[0-9]/.test(newPassword)
  const matches = newPassword.length > 0 && newPassword === confirm
  const allValid = hasLength && hasNumber && matches

  const submit = async (e: Event) => {
    e.preventDefault()
    setError(null)
    if (!allValid) return
    setSubmitting(true)
    try {
      await changeMyPassword(newPassword)
      setNewPassword('')
      setConfirm('')
      setSuccess(true)

      await refreshUser()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.isNetwork ? `Can't reach the API at ${API_BASE} — is the backend running?` : err.message)
      } else {
        setError('Something went wrong.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <BackLink href={from} label={`Back to ${pageName(from)}`} onClick={() => route(from)} />
      <PageHeader title="Your profile" subtitle="View your account and change your password." />

      <div class="card" style={{ marginBottom: 18 }}>
        <div class="profile-head">
          <div class="profile-avatar">{initials(user.name)}</div>
          <div>
            <div class="profile-name">{user.name}</div>
            <div class="profile-email">{user.email}</div>
            <div style={{ marginTop: 6 }}>
              <RoleBadge role={user.role} />
            </div>
          </div>
        </div>
      </div>

      {user.role !== 'admin' ? (
        <>
      {user.mustChangePassword && (
        <div class="note" style={{ marginBottom: 18 }}>
          You're using a temporary password issued by your admin. We recommend setting
          your own password below.
        </div>
      )}

      <div class="card">
        <h2 class="section-title" style={{ margin: '0 0 14px' }}>
          Change password
        </h2>

        {success && (
          <div class="banner-success" style={{ marginBottom: 14 }}>
            ✓ Your password has been updated.
          </div>
        )}
        {error && <div class="banner-error" style={{ marginBottom: 14 }}>{error}</div>}

        <form onSubmit={submit}>
          <div class="field">
            <label for="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              autocomplete="new-password"
              onInput={(e) => {
                setNewPassword((e.target as HTMLInputElement).value)
                setSuccess(false)
              }}
            />
          </div>

          <div class="field">
            <label for="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirm}
              autocomplete="new-password"
              onInput={(e) => {
                setConfirm((e.target as HTMLInputElement).value)
                setSuccess(false)
              }}
            />
          </div>

          <ul class="pw-rules">
            <Rule ok={hasLength} text="At least 8 characters" />
            <Rule ok={hasNumber} text="Contains a number" />
            <Rule ok={matches} text="Both passwords match" />
          </ul>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" disabled={!allValid || submitting}>
              {submitting ? 'Saving…' : 'Save new password'}
            </button>
          </div>
        </form>
      </div>
        </>
      ) : (
        <div class="card">
          <p class="subtle" style={{ margin: 0 }}>
            Admin accounts don't manage their password from this page.
          </p>
        </div>
      )}
    </div>
  )
}

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li class={`pw-rule ${ok ? 'ok' : ''}`}>
      <span class="pw-rule-mark" aria-hidden="true">
        {ok ? '✓' : '○'}
      </span>
      {text}
    </li>
  )
}
