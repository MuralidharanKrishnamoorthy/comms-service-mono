import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { Router, route, getCurrentUrl } from 'preact-router'
import { StoreProvider } from './store'
import { useAuth } from './auth'
import { Login } from './routes/Login'
import { Projects } from './routes/Projects'
import { ProjectDetail } from './routes/ProjectDetail'
import { Templates } from './routes/Templates'
import { Categories } from './routes/Categories'
import { CategoryDetail } from './routes/CategoryDetail'
import { TemplateNew } from './routes/TemplateNew'
import { TemplateEdit } from './routes/TemplateEdit'
import { Logs } from './routes/Logs'
import { UsersAccess, RoleBadge } from './routes/UsersAccess'
import { Profile } from './routes/Profile'

// Whether a nav item should read as active for the current path. Detail routes
// count as their section — /projects/:id lights up Projects, /categories/:id
// lights up Categories — so navigating deeper never leaves the sidebar blank.
function navIsActive(path: string, href: string): boolean {
  const base = path.replace(/\?.*$/, '')
  if (href === '/projects') {
    return base === '/' || base === '/projects' || base.startsWith('/projects/')
  }
  return base === href || base.startsWith(`${href}/`)
}

// A plain anchor rather than preact-router/match's Link: the sidebar lives
// outside the <Router>, and Match's active state doesn't reliably resync when
// the shell remounts on login. Driving `active` from the Router's onChange —
// the same event that swaps the page — keeps the two in lockstep.
function NavLink({
  href,
  path,
  children,
}: {
  href: string
  path: string
  children?: ComponentChildren
}) {
  return (
    <a
      href={href}
      class={navIsActive(path, href) ? 'active' : undefined}
      onClick={(e) => {
        e.preventDefault()
        route(href)
      }}
    >
      {children}
    </a>
  )
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d={d} />
    </svg>
  )
}

const ICONS = {
  projects: 'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7',
  templates: 'M4 4h16v4H4zM4 12h10v8H4zM17 12h3v8h-3z',
  categories: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  logs: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
}

function Sidebar({ path }: { path: string }) {
  const { user } = useAuth()
  return (
    <aside class="sidebar">
      <div class="brand">
        <span>Notifyr</span>
      </div>
      <nav class="nav">
        <NavLink href="/projects" path={path}>
          <NavIcon d={ICONS.projects} />
          Projects
        </NavLink>
        <NavLink href="/templates" path={path}>
          <NavIcon d={ICONS.templates} />
          Templates
        </NavLink>
        <NavLink href="/categories" path={path}>
          <NavIcon d={ICONS.categories} />
          Categories
        </NavLink>
        <NavLink href="/logs" path={path}>
          <NavIcon d={ICONS.logs} />
          Notification Logs
        </NavLink>
        {user?.role === 'admin' && (
          <NavLink href="/admin/users" path={path}>
            <NavIcon d={ICONS.users} />
            Users & Access
          </NavLink>
        )}
      </nav>
    </aside>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

function Topbar() {
  const { user, logout } = useAuth()
  if (!user) return null

  const openProfile = () => route(`/profile?from=${encodeURIComponent(getCurrentUrl())}`)

  return (
    <header class="topbar">
      <div />
      <div class="topbar-user">
        <button class="topbar-user-btn" onClick={openProfile} title="Your profile">
          <div class="topbar-avatar">{initials(user.name)}</div>
          <div class="topbar-user-meta">
            <span class="topbar-user-name">{user.name}</span>
            <RoleBadge role={user.role} />
          </div>
        </button>
        <button class="topbar-logout" onClick={() => void logout()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5M21 12H9" />
          </svg>
          Log out
        </button>
      </div>
    </header>
  )
}

// The authenticated shell. StoreProvider lives here so the projects fetch only
// runs once we actually have a session.
function Shell() {
  // The current path, kept in sync by the Router's own onChange so the sidebar
  // highlight and the routed page can never disagree — even right after login,
  // when the shell remounts on a URL left over from before.
  const [path, setPath] = useState(getCurrentUrl())
  return (
    <StoreProvider>
      <div class="shell">
        <Sidebar path={path} />
        <div class="main">
          <Topbar />
          <main class="content">
            <Router onChange={(e) => setPath(e.url)}>
              <Projects path="/" />
              <Projects path="/projects" />
              <ProjectDetail path="/projects/:id" />
              <Templates path="/templates" />
              <Categories path="/categories" />
              <CategoryDetail path="/categories/:categoryId" />
              <TemplateNew path="/templates/new" />
              <TemplateEdit path="/templates/:templateKey" />
              <Logs path="/logs" />
              <UsersAccess path="/admin/users" />
              <Profile path="/profile" />
              <NotFound default />
            </Router>
          </main>
        </div>
      </div>
    </StoreProvider>
  )
}

export function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div class="app-splash">
        <span>Loading…</span>
      </div>
    )
  }

  if (!user) return <Login />

  return <Shell />
}

function NotFound(_props: { default?: boolean }) {
  return (
    <div class="empty">
      <p>Page not found.</p>
      <button class="btn" onClick={() => route('/')}>
        Go to Projects
      </button>
    </div>
  )
}
