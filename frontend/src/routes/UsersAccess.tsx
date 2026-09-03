import { useEffect, useMemo, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useAuth } from '../auth'
import { useStore } from '../store'
import {
  ApiError,
  API_BASE,
  createUser,
  listUsers,
  updateUser,
  type CreateUserBody,
  type UpdateUserBody,
} from '../api'
import type { ManagedUser, Role } from '../types'
import { ApiBanner, Modal, PageHeader } from '../components/ui'

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'developer', label: 'Developer' },
  { value: 'ba', label: 'BA' },
  { value: 'tester', label: 'Tester' },
]

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  developer: 'Developer',
  ba: 'BA',
  tester: 'Tester',
}

export function RoleBadge({ role }: { role: Role }) {
  return <span class={`role-pill role-${role}`}>{ROLE_LABEL[role]}</span>
}

export function UsersAccess(_props: { path?: string }) {
  const { user } = useAuth()
  const { projects } = useStore()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [editing, setEditing] = useState<ManagedUser | null>(null)
  const [creating, setCreating] = useState(false)

  const projectName = useMemo(() => {
    const m = new Map(projects.map((p) => [p._id, p.name]))
    return (id: string) => m.get(id) ?? id.slice(-6)
  }, [projects])

  const isAdmin = user?.role === 'admin'

  const refresh = () => {
    setLoading(true)
    setUnreachable(false)
    listUsers()
      .then(setUsers)
      .catch((err) => {
        if (err instanceof ApiError && err.isNetwork) setUnreachable(true)
        setUsers([])
      })
      .finally(() => setLoading(false))
  }

  // Non-admins can't be here — send them to Projects. (Backend enforces it too.)
  useEffect(() => {
    if (!isAdmin) route('/projects', true)
  }, [isAdmin])

  useEffect(() => {
    if (isAdmin) refresh()
  }, [isAdmin])

  if (!isAdmin) return null

  return (
    <div>
      <PageHeader
        title="Users & Access"
        subtitle="Manage who can sign in and which projects they can see."
        actions={
          <button class="btn btn-primary" onClick={() => setCreating(true)}>
            + Add user
          </button>
        }
      />

      {unreachable && <ApiBanner base={API_BASE} />}

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Project access</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr class="state-row">
                <td colSpan={5}>Loading…</td>
              </tr>
            ) : unreachable ? (
              <tr class="state-row">
                <td colSpan={5}>Couldn't load users.</td>
              </tr>
            ) : users.length === 0 ? (
              <tr class="state-row">
                <td colSpan={5}>No users yet — click Add user to create one.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u._id}>
                  <td class="cell-primary">
                    {u.name}
                    {u.status === 'disabled' && (
                      <span class="badge badge-neutral" style={{ marginLeft: 8 }}>
                        disabled
                      </span>
                    )}
                  </td>
                  <td class="cell-muted">{u.email}</td>
                  <td>
                    <RoleBadge role={u.role} />
                  </td>
                  <td>
                    {u.role === 'admin' ? (
                      <span class="cell-faint">All projects</span>
                    ) : u.project_ids.length === 0 ? (
                      <span class="cell-faint">None</span>
                    ) : (
                      <span class="chip-row">
                        {u.project_ids.map((id) => (
                          <span key={id} class="chip">
                            {projectName(id)}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button class="btn btn-sm" onClick={() => setEditing(u)}>
                      Edit access
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <UserModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            refresh()
          }}
        />
      )}
      {editing && (
        <UserModal
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function UserModal({
  mode,
  existing,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  existing?: ManagedUser
  onClose: () => void
  onSaved: () => void
}) {
  const { projects } = useStore()
  const [name, setName] = useState(existing?.name ?? '')
  const [email, setEmail] = useState(existing?.email ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(existing?.role ?? 'developer')
  const [status, setStatus] = useState<'active' | 'disabled'>(existing?.status ?? 'active')
  const [projectIds, setProjectIds] = useState<string[]>(existing?.project_ids ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const toggleProject = (id: string) =>
    setProjectIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Name is required.'
    if (!email.trim()) e.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email.'
    // Password required on create; optional (reset) on edit.
    if (mode === 'create') {
      if (!password) e.password = 'Password is required.'
      else if (password.length < 8) e.password = 'Password must be at least 8 characters.'
    } else if (password && password.length < 8) {
      e.password = 'Password must be at least 8 characters.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev: Event) => {
    ev.preventDefault()
    setBanner(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      if (mode === 'create') {
        const body: CreateUserBody = {
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          ...(role === 'admin' ? {} : { project_ids: projectIds }),
        }
        await createUser(body)
      } else if (existing) {
        const body: UpdateUserBody = {
          name: name.trim(),
          email: email.trim(),
          role,
          status,
          ...(role === 'admin' ? {} : { project_ids: projectIds }),
          ...(password ? { password } : {}), // only reset if the admin typed one
        }
        await updateUser(existing._id, body)
      }
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isNetwork) setBanner(`Can't reach the API at ${API_BASE} — is the backend running?`)
        else if (err.status === 400 && err.details?.fieldErrors) {
          const fe = err.details.fieldErrors
          const mapped: Record<string, string> = {}
          for (const [k, msgs] of Object.entries(fe)) if (msgs?.[0]) mapped[k] = msgs[0]
          setErrors(mapped)
          if (!Object.keys(mapped).length) setBanner(err.message)
        } else setBanner(err.message)
      } else setBanner('Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title={mode === 'create' ? 'Add user' : `Edit ${existing?.name ?? 'user'}`} onClose={onClose} width={520}>
      {banner && <div class="banner-error" style={{ marginBottom: 14 }}>{banner}</div>}
      <form onSubmit={submit}>
        <div class="field">
          <label>Name</label>
          <input
            type="text"
            value={name}
            class={errors.name ? 'invalid' : ''}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          {errors.name && <div class="field-error">{errors.name}</div>}
        </div>

        <div class="field">
          <label>Email</label>
          <input
            type="text"
            value={email}
            class={errors.email ? 'invalid' : ''}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          />
          {errors.email && <div class="field-error">{errors.email}</div>}
        </div>

        <div class="field">
          <label>
            {mode === 'create' ? 'Password' : 'Reset password (optional)'}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              class={`mono ${errors.password ? 'invalid' : ''}`}
              value={password}
              placeholder={mode === 'edit' ? 'Leave blank to keep current password' : ''}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            />
            <button type="button" class="btn" onClick={() => setPassword(generatePassword())}>
              Generate
            </button>
          </div>
          {errors.password && <div class="field-error">{errors.password}</div>}
        </div>

        <div class="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value as Role)}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {mode === 'edit' && (
          <div class="field">
            <label>Account status</label>
            <select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value as 'active' | 'disabled')}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        )}

        {/* Project access — hidden for admin, who implicitly has all projects. */}
        {role !== 'admin' && (
          <div class="field">
            <label>Project access</label>
            {projects.length === 0 ? (
              <p class="subtle" style={{ margin: 0 }}>No projects exist yet.</p>
            ) : (
              <div class="checkbox-list">
                {projects.map((p) => (
                  <label key={p._id} class="checkbox-row">
                    <input
                      type="checkbox"
                      checked={projectIds.includes(p._id)}
                      onChange={() => toggleProject(p._id)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : mode === 'create' ? 'Create user' : 'Save changes'}
          </button>
          <button type="button" class="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
