// One pagination control, shared by every paged list (Templates, Notification
// Logs, Users & Access). It is presentational only: it never fetches or holds
// page state — the parent owns `currentPage` and refetches in `onPageChange`.
// totalItems/totalPages come from the API's pagination object, never computed
// from a partial page of rows.

// Build the windowed list of page buttons: always the first and last page, a
// small window around the current page, and "…" where a gap is collapsed.
function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const out: (number | 'gap')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  if (start > 2) out.push('gap')
  for (let p = start; p <= end; p++) out.push(p)
  if (end < total - 1) out.push('gap')

  out.push(total)
  return out
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  // Nothing to page through — render nothing rather than an empty control.
  if (totalItems === 0) return null

  const from = (currentPage - 1) * pageSize + 1
  const to = Math.min(currentPage * pageSize, totalItems)
  const onFirst = currentPage <= 1
  const onLast = currentPage >= totalPages

  return (
    <div class="pagination">
      <span class="pagination-summary">
        Showing {from}–{to} of {totalItems}
      </span>

      <div class="pagination-controls">
        <button
          type="button"
          class="btn btn-sm"
          disabled={onFirst}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Prev
        </button>

        {pageWindow(currentPage, totalPages).map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} class="pagination-gap">
              …
            </span>
          ) : (
            <button
              type="button"
              key={p}
              class={`btn btn-sm pagination-page ${p === currentPage ? 'active' : ''}`}
              aria-current={p === currentPage ? 'page' : undefined}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          class="btn btn-sm"
          disabled={onLast}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}
