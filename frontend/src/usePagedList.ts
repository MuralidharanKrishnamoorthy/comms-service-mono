import { useEffect, useRef, useState } from 'preact/hooks'
import { ApiError, type Paginated, type PaginationMeta } from './api'

const EMPTY_META: PaginationMeta = { page: 1, limit: 10, totalItems: 0, totalPages: 0 }

export interface PagedList<T> {
  items: T[]
  pagination: PaginationMeta
  page: number
  setPage: (page: number) => void
  loading: boolean
  unreachable: boolean
  reload: () => void
}

// Drives one paginated list, identically for every module. It owns the page
// number and the pagination metadata (read from the API, never computed from a
// partial page), and enforces the two filter/pagination rules the spec calls
// out:
//   1. A filter change resets to page 1 before refetching — never leaves the
//      user on a stale page from the previous filter's result set.
//   2. If the server returns an empty page past the end (rows shrank under us),
//      snap back to page 1 instead of a blank table with dead controls.
// `filterKey` must be a stable string built from every active filter; changing
// it is what signals "filters changed". A page change keeps the filters.
export function usePagedList<T>(
  fetchPage: (page: number) => Promise<Paginated<T>>,
  filterKey: string,
  enabled = true
): PagedList<T> {
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<T[]>([])
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_META)
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const prevKey = useRef(filterKey)

  useEffect(() => {
    if (!enabled) {
      setItems([])
      setPagination(EMPTY_META)
      setLoading(false)
      return
    }

    // A filter changed: restart at page 1. Returning here lets the resulting
    // page change re-run this effect and do the single fetch, so a filter
    // change never fetches the stale page number first.
    if (prevKey.current !== filterKey) {
      prevKey.current = filterKey
      if (page !== 1) {
        setPage(1)
        return
      }
    }

    let cancelled = false
    setLoading(true)
    setUnreachable(false)
    fetchPage(page)
      .then((res) => {
        if (cancelled) return
        if (res.data.length === 0 && page > 1 && page > res.pagination.totalPages) {
          setPage(1)
          return
        }
        setItems(res.data)
        setPagination(res.pagination)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.isNetwork) setUnreachable(true)
        setItems([])
        setPagination(EMPTY_META)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // fetchPage is intentionally excluded: filterKey is the signal for "inputs
    // changed", so we don't want a new closure identity to retrigger fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterKey, enabled, reloadTick])

  return {
    items,
    pagination,
    page,
    setPage,
    loading,
    unreachable,
    reload: () => setReloadTick((t) => t + 1),
  }
}
