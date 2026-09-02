import { createContext } from 'preact'
import type { ComponentChildren } from 'preact'
import { useCallback, useContext, useEffect, useState } from 'preact/hooks'
import * as api from './api'
import { ApiError, setUnauthorizedHandler } from './api'
import type { AuthUser } from './types'

interface AuthState {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ComponentChildren }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Any 401 from a normal API call means the session is gone — drop the user,
  // which flips the app to the login screen.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  // Hydrate the session on boot (the cookie is sent automatically).
  useEffect(() => {
    let cancelled = false
    api
      .getMe()
      .then((u) => {
        if (!cancelled) setUser(u)
      })
      .catch(() => {
        // 401 (not logged in) or network error → treat as logged out.
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.login(email, password)
    setUser(u)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch (err) {
      // A network failure shouldn't trap the user in a logged-in shell.
      if (!(err instanceof ApiError)) throw err
    }
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
