import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiBanner, ChannelChips, PageHeader, StatusBadge } from '../components/ui'
import { formatDate } from '../util'
import { API_BASE } from '../api'

export function Projects(_props: { path?: string }) {
  const { projects, projectsLoading, projectsUnreachable } = useStore()

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Each project gets its own API key and message templates."
      />

      {projectsUnreachable && <ApiBanner base={API_BASE} />}

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Key prefix</th>
              <th>Channels</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {projectsLoading ? (
              <tr class="state-row">
                <td colSpan={5}>Loading…</td>
              </tr>
            ) : projectsUnreachable ? (
              <tr class="state-row">
                <td colSpan={5}>Couldn't load projects.</td>
              </tr>
            ) : projects.length === 0 ? (
              <tr class="state-row">
                <td colSpan={5}>No projects yet.</td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr
                  key={p._id}
                  class="clickable"
                  onClick={() => route(`/projects/${p._id}`)}
                >
                  <td class="cell-primary">{p.name}</td>
                  <td>
                    <span class="mono">{p.api_key_prefix}…</span>
                  </td>
                  <td>
                    <ChannelChips channels={p.channels_allowed} />
                  </td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td class="cell-faint">{formatDate(p.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
