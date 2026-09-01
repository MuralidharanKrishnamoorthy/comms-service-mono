import type { ComponentChildren, FunctionComponent } from 'preact'
import { Router, route } from 'preact-router'
import { Link as MatchLink } from 'preact-router/match'
import { useStore } from './store'
import { API_BASE } from './api'
import { Dashboard } from './routes/Dashboard'
import { Projects } from './routes/Projects'
import { ProjectDetail } from './routes/ProjectDetail'
import { Templates } from './routes/Templates'
import { TemplateNew } from './routes/TemplateNew'
import { TemplateEdit } from './routes/TemplateEdit'
import { Logs } from './routes/Logs'

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
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  projects: 'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7',
  templates: 'M4 4h16v4H4zM4 12h10v8H4zM17 12h3v8h-3z',
  logs: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
}

function Sidebar() {
  return (
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">C</span>
        <span>
          Comms Service
          <div class="brand-sub">Admin console</div>
        </span>
      </div>
      <nav class="nav">
        <NavLink href="/" activeClassName="active">
          <NavIcon d={ICONS.dashboard} />
          Dashboard
        </NavLink>
        <NavLink href="/projects" activeClassName="active">
          <NavIcon d={ICONS.projects} />
          Projects
        </NavLink>
        <NavLink href="/templates" activeClassName="active">
          <NavIcon d={ICONS.templates} />
          Templates
        </NavLink>
        <NavLink href="/logs" activeClassName="active">
          <NavIcon d={ICONS.logs} />
          Notification Logs
        </NavLink>
      </nav>
      <div class="sidebar-foot">
        API base
        <br />
        <span class="mono">{API_BASE}</span>
      </div>
    </aside>
  )
}

function Topbar() {
  const { projects, selectedProjectId, setSelectedProjectId, projectsUnreachable } = useStore()

  return (
    <header class="topbar">
      <div class="topbar-left">
        <span class="switcher-label">Project</span>
        <div class="switcher">
          {projects.length === 0 ? (
            <span class="subtle">No projects yet</span>
          ) : (
            <select
              value={selectedProjectId ?? ''}
              onChange={(e) => setSelectedProjectId((e.target as HTMLSelectElement).value)}
            >
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div class="topbar-right">
        <span class={`api-dot ${projectsUnreachable ? 'down' : ''}`} />
        {projectsUnreachable ? 'API unreachable' : 'API connected'}
      </div>
    </header>
  )
}

export function App() {
  return (
    <div class="shell">
      <Sidebar />
      <div class="main">
        <Topbar />
        <main class="content">
          <Router>
            <Dashboard path="/" />
            <Projects path="/projects" />
            <ProjectDetail path="/projects/:id" />
            <Templates path="/templates" />
            <TemplateNew path="/templates/new" />
            <TemplateEdit path="/templates/:templateKey" />
            <Logs path="/logs" />
            <NotFound default />
          </Router>
        </main>
      </div>
    </div>
  )
}

function NotFound(_props: { default?: boolean }) {
  return (
    <div class="empty">
      <p>Page not found.</p>
      <button class="btn" onClick={() => route('/')}>
        Go to Dashboard
      </button>
    </div>
  )
}
