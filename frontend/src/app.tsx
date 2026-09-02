import type { ComponentChildren, FunctionComponent } from 'preact'
import { Router, route } from 'preact-router'
import { Link as MatchLink } from 'preact-router/match'
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

// preact-router's own Link type omits `href` under this preact version's JSX
// typings, so re-type the reactive match-Link with the props we actually use.
const NavLink = MatchLink as unknown as FunctionComponent<{
  href: string
  activeClassName?: string
  children?: ComponentChildren
}>

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

function Sidebar() {
  const { user } = useAuth()
  return (
    <aside class="sidebar">
      <div class="brand">
        <span>Notifyr</span>
      </div>
      <nav class="nav">
        <NavLink href="/projects" activeClassName="active">
          <NavIcon d={ICONS.projects} />
          Projects
        </NavLink>
        <NavLink href="/templates" activeClassName="active">
          <NavIcon d={ICONS.templates} />
          Templates
        </NavLink>
        <NavLink href="/categories" activeClassName="active">
          <NavIcon d={ICONS.categories} />
          Categories
        </NavLink>
        <NavLink href="/logs" activeClassName="active">
          <NavIcon d={ICONS.logs} />
          Notification Logs
        </NavLink>
        {user?.role === 'admin' && (
          <NavLink href="/admin/users" activeClassName="active">
            <NavIcon d={ICONS.users} />
            Users & Access
          </NavLink>
        )}
      </nav>
    </aside>
  )
}

function Topbar() {
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <header class="topbar">
      <div />
      <div class="topbar-user">
        <div class="topbar-user-meta">
          <span class="topbar-user-name">{user.name}</span>
          <RoleBadge role={user.role} />
        </div>
        <button class="btn btn-sm" onClick={() => void logout()}>
          Log out
        </button>
      </div>
    </header>
  )
}

// The authenticated shell. StoreProvider lives here so the projects fetch only
// runs once we actually have a session.
function Shell() {
  return (
    <StoreProvider>
      <div class="shell">
        <Sidebar />
        <div class="main">
          <Topbar />
          <main class="content">
            <Router>
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
