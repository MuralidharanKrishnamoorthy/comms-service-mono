import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiError, API_BASE, listTemplates } from '../api'
import type { Template } from '../types'
import { ApiBanner, PageHeader } from '../components/ui'

interface CategoryRow {
  name: string
  count: number
}

export function Categories(_props: { path?: string }) {
  const { selectedProject } = useStore()
  const [rows, setRows] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)

  useEffect(() => {
    if (!selectedProject) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setUnreachable(false)

    listTemplates(selectedProject._id)
      .then((templates: Template[]) => {
        if (cancelled) return
        const counts = new Map<string, number>()
        for (const t of templates) {
          counts.set(t.category, (counts.get(t.category) ?? 0) + 1)
        }
        const next = Array.from(counts.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name))
        setRows(next)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.isNetwork) setUnreachable(true)
        setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedProject])

  if (!selectedProject) {
    return (
      <div>
        <PageHeader title="Categories" />
        <div class="empty">Select a project in the top bar to view its categories.</div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle={`Template categories for ${selectedProject.name}.`}
      />

      {unreachable && <ApiBanner base={API_BASE} />}

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Templates</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr class="state-row">
                <td colSpan={2}>Loading…</td>
              </tr>
            ) : unreachable ? (
              <tr class="state-row">
                <td colSpan={2}>Couldn't load categories.</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr class="state-row">
                <td colSpan={2}>No templates yet — categories show up once you create one.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.name} class="clickable" onClick={() => route('/templates')}>
                  <td class="cell-primary">{r.name}</td>
                  <td class="cell-muted">{r.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
