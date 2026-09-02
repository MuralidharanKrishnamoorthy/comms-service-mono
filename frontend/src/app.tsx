import type { ComponentChildren, FunctionComponent } from 'preact'
import { Router, route } from 'preact-router'
import { Link as MatchLink } from 'preact-router/match'
import { Projects } from './routes/Projects'
import { ProjectDetail } from './routes/ProjectDetail'
import { Templates } from './routes/Templates'
import { Categories } from './routes/Categories'
import { CategoryDetail } from './routes/CategoryDetail'
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
  projects: 'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7',
  templates: 'M4 4h16v4H4zM4 12h10v8H4zM17 12h3v8h-3z',
  categories: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  logs: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
}

function Sidebar() {
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
      </nav>
    </aside>
  )
}

export function App() {
  return (
    <div class="shell">
      <Sidebar />
      <div class="main">
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
        Go to Projects
      </button>
    </div>
  )
}
