import { useState } from 'preact/hooks'
import { useAuth } from '../auth'
import { ApiError, API_BASE } from '../api'

export function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: Event) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      // On success the AuthProvider sets the user and the app renders the shell.
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isNetwork) setError(`Can't reach the API at ${API_BASE} — is the backend running?`)
        else setError(err.message)
      } else {
        setError('Something went wrong.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div class="login-page">
      <form class="login-card" onSubmit={submit}>
        <div class="login-brand">Notifyr</div>
        <p class="login-sub">Sign in to the admin console</p>

        {error && <div class="banner-error" style={{ marginBottom: 16 }}>{error}</div>}

        <div class="field">
          <label for="login-email">Email</label>
          <input
            id="login-email"
            type="text"
            autoFocus
            value={email}
            placeholder="you@company.com"
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="field">
          <label for="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            placeholder="••••••••"
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          />
        </div>

        <button type="submit" class="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
