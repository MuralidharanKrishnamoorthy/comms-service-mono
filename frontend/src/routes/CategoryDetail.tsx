import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { ApiError, API_BASE, getCategory } from '../api'
import type { AttachedTemplateRow } from '../types'
import { ApiBanner, BackLink, ChannelChips, PageHeader } from '../components/ui'
import { enabledChannels } from '../util'

/**
 * Read-only view of one category: every template in it, one per row, across
 * every project at once. Editing (renaming, adding, removing templates) lives
 * in the Edit dialog on the category card — one place, not two.
 */
export function CategoryDetail({ categoryId }: { path?: string; categoryId?: string }) {
  const [name, setName] = useState('')
  const [attached, setAttached] = useState<AttachedTemplateRow[]>([])
  const [hiddenCount, setHiddenCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!categoryId) return
    let cancelled = false
    setLoading(true)
    setUnreachable(false)
    setNotFound(false)

    getCategory(categoryId)
      .then((data) => {
        if (cancelled) return
        setName(data.category.name)
        setAttached(data.attached)
        setHiddenCount(data.hidden_count)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError) {
          if (err.isNetwork) setUnreachable(true)
          else if (err.status === 404) setNotFound(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [categoryId])

  const back = (
    <BackLink href="/categories" label="Back to categories" onClick={() => route('/categories')} />
  )

  if (loading) {
    return (
      <div>
        {back}
        <div class="empty">Loading…</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div>
        {back}
        <div class="card">Category not found.</div>
      </div>
    )
  }

  const total = attached.length + hiddenCount
  const subtitle =
    hiddenCount > 0
      ? `${attached.length} of ${total} templates — ${hiddenCount} in projects you can't access.`
      : `${attached.length} ${attached.length === 1 ? 'template' : 'templates'} in this category.`

  return (
    <div>
      {back}

      {unreachable && <ApiBanner base={API_BASE} />}

      <PageHeader title={name} subtitle={subtitle} />

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Template</th>
              <th>Project</th>
              <th>Channels</th>
            </tr>
          </thead>
          <tbody>
            {attached.length === 0 ? (
              <tr class="state-row">
                <td colSpan={3}>
                  Nothing in this category yet — use Edit on the category card to add templates.
                </td>
              </tr>
            ) : (
              attached.map((row) => (
                <tr key={row.template_id}>
                  <td>
                    <div class="cell-primary">{row.name}</div>
                    <div class="cell-secondary mono">{row.template_key}</div>
                  </td>
                  <td class="cell-muted">{row.project_name}</td>
                  <td>
                    <ChannelChips channels={enabledChannels(row.channels ?? {})} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
