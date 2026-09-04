import { useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useAuth } from '../auth'
import { ApiError, API_BASE } from '../api'

// Hand-drawn inline icons, matching the pattern used everywhere else in this
// app (see components/ui.tsx BackLink, app.tsx NavIcon) rather than pulling
// in an icon library — lucide-react itself depends on React internals this
// Preact app doesn't have installed.
function iconProps() {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linecap': 'round' as const,
    'stroke-linejoin': 'round' as const,
  }
}

function MailIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a16.6 16.6 0 0 1-3.1 4M6.5 6.6C4 8.3 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.4-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}

export function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
      // Always land on Projects — the URL may still point at wherever the last
      // session was (e.g. /admin/users), which a non-admin can't open.
      route('/projects', true)
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
    <div class="gaming-login">
      <div class="gaming-login-video">
        <video
          autoPlay
          loop
          muted
          playsInline
          src="https://videos.pexels.com/video-files/8128311/8128311-uhd_2560_1440_25fps.mp4"
        />
        <div class="gaming-login-scrim" />
      </div>

      <div class="gaming-login-content">
        <div class="gaming-login-card">
          <div class="gaming-login-head">
            <h1 class="gaming-login-title">Notifyr</h1>
            <p class="gaming-login-tagline">Sign in to your dashboard</p>
          </div>

          <form onSubmit={submit} class="gaming-login-form">
            {error && <div class="banner-error" style={{ marginBottom: 16 }}>{error}</div>}

            <div class="gaming-input">
              <span class="gaming-input-icon">
                <MailIcon />
              </span>
              <input
                type="text"
                autoFocus
                placeholder="Email address"
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              />
            </div>

            <div class="gaming-input">
              <span class="gaming-input-icon">
                <LockIcon />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                class="gaming-input-toggle"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            <button type="submit" class="gaming-login-submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Enter Notifyr'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
