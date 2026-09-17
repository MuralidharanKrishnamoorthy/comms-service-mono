import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { API_BASE, listCategories, listLogs } from '../api'
import type { Category, MessageLog, MessageStatus } from '../types'
import { ApiBanner, Dropdown, PageHeader, StatusBadge } from '../components/ui'
import { Pagination } from '../components/Pagination'
import { usePagedList } from '../usePagedList'
import { formatDate, linkWithReturn } from '../util'

const STATUSES: MessageStatus[] = ['sent', 'failed']
const CHANNELS = ['email', 'sms', 'push']

export function Logs(_props: { path?: string }) {
  const { projects, setSelectedProjectId } = useStore()
  const projectName = (id: string) => projects.find((p) => p._id === id)?.name ?? '—'

  const [projectFilter, setProjectFilter] = useState('')
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')

  const [categories, setCategories] = useState<Category[]>([])
  const [categoryFilter, setCategoryFilter] = useState('')

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [])

  // All four filters (project, category, status, channel) are applied
  // server-side before the page window; the category filter is resolved to its
  // templates on the backend. Any filter change resets to page 1 via the key.
  const list = usePagedList<MessageLog>(
    (page) =>
      listLogs({
        project: projectFilter || undefined,
        category: categoryFilter || undefined,
        status: status || undefined,
        channel: channel || undefined,
        page,
      }),
    `${projectFilter}|${categoryFilter}|${status}|${channel}`,
    projects.length > 0
  )

  const visibleLogs = list.items

  if (projects.length === 0) {
    return (
      <div>
        <PageHeader title="Notification Logs" />
        <div class="empty">No projects yet — create one to see its send history.</div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Notification Logs" />

      {list.unreachable && <ApiBanner base={API_BASE} />}

      <div class="toolbar">
        <div class="field toolbar-field">
          <label>Project</label>
          <Dropdown
            class="project-select"
            value={projectFilter}
            onChange={setProjectFilter}
            onClear={() => setProjectFilter('')}
            options={[
              { value: '', label: 'All projects' },
              ...projects.map((p) => ({ value: p._id, label: p.name })),
            ]}
          />
        </div>
        <div class="field toolbar-field">
          <label>Category</label>
          <Dropdown
            value={categoryFilter}
            onChange={setCategoryFilter}
            onClear={() => setCategoryFilter('')}
            options={[
              { value: '', label: 'All categories' },
              ...categories.map((c) => ({ value: c._id, label: c.name })),
            ]}
          />
        </div>
        <div class="field toolbar-field">
          <label>Status</label>
          <Dropdown
            value={status}
            onChange={setStatus}
            onClear={() => setStatus('')}
            options={[{ value: '', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
          />
        </div>
        <div class="field toolbar-field">
          <label>Channel</label>
          <Dropdown
            value={channel}
            onChange={setChannel}
            onClear={() => setChannel('')}
            options={[{ value: '', label: 'All channels' }, ...CHANNELS.map((c) => ({ value: c, label: c }))]}
          />
        </div>
        {(projectFilter || categoryFilter || status || channel) && (
          <button
            class="btn btn-sm"
            onClick={() => {
              setProjectFilter('')
              setCategoryFilter('')
              setStatus('')
              setChannel('')
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Template</th>
              <th>Project</th>
              <th>Channel</th>
              <th>Recipient</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {list.loading ? (
              <tr class="state-row">
                <td colSpan={6}>Loading…</td>
              </tr>
            ) : list.unreachable ? (
              <tr class="state-row">
                <td colSpan={6}>Couldn't load logs.</td>
              </tr>
            ) : visibleLogs.length === 0 ? (
              <tr class="state-row">
                <td colSpan={6}>
                  {status || channel || categoryFilter
                    ? 'No sends match these filters.'
                    : 'No sends yet for this project.'}
                </td>
              </tr>
            ) : (
              visibleLogs.map((log) => (
                <tr
                  key={log._id}
                  class="clickable"
                  title={`Open project ${projectName(log.project_id)}`}
                  onClick={() => {
                    setSelectedProjectId(log.project_id)
                    route(
                      linkWithReturn(
                        `/projects/${log.project_id}`,
                        '/logs',
                        'notification logs'
                      )
                    )
                  }}
                >
                  <td>
                    <button
                      type="button"
                      class="cell-link mono"
                      title={`Open template ${log.template_key}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedProjectId(log.project_id)
                        route(
                          linkWithReturn(
                            `/templates/${log.template_key}`,
                            '/logs',
                            'notification logs'
                          )
                        )
                      }}
                    >
                      {log.template_key}
                    </button>
                  </td>

                  <td class="cell-muted">{projectName(log.project_id)}</td>
                  <td>
                    <span class="chip">{log.channel}</span>
                  </td>
                  <td class="cell-muted">{log.recipient}</td>
                  <td>
                    <StatusBadge status={log.status} />
                  </td>
                  <td class="cell-faint">{formatDate(log.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={list.pagination.page}
        totalPages={list.pagination.totalPages}
        totalItems={list.pagination.totalItems}
        pageSize={list.pagination.limit}
        onPageChange={list.setPage}
      />
    </div>
  )
}
