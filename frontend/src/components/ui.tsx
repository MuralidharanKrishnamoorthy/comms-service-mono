import type { ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'
import type { MessageStatus } from '../types'

// ---------- Status badge ----------
export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'sent' || status === 'delivered' || status === 'active'
      ? 'badge-success'
      : status === 'failed'
        ? 'badge-danger'
        : status === 'pending'
          ? 'badge-warning'
          : 'badge-neutral'
  return <span class={`badge ${cls}`}>{status}</span>
}

export function statusClass(status: MessageStatus): string {
  return status
}

// ---------- Channel chips ----------
export function ChannelChips({ channels }: { channels: string[] }) {
  if (!channels.length) return <span class="cell-faint">—</span>
  return (
    <span class="chip-row">
      {channels.map((c) => (
        <span key={c} class="chip">
          {c}
        </span>
      ))}
    </span>
  )
}

// ---------- API-unreachable banner ----------
export function ApiBanner({ base }: { base: string }) {
  return (
    <div class="banner-error" role="alert">
      <span aria-hidden="true">⚠</span>
      <span>
        Can't reach the API at <span class="mono">{base}</span> — is the backend running?
      </span>
    </div>
  )
}

// ---------- Modal ----------
export function Modal({
  title,
  onClose,
  children,
  width = 460,
}: {
  title: string
  onClose: () => void
  children: ComponentChildren
  width?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div class="overlay" onClick={onClose}>
      <div
        class="modal"
        style={{ maxWidth: `${width}px` }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="modal-head">
          <h3>{title}</h3>
          <button class="btn-icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  )
}

// ---------- Drawer (slides from right) ----------
export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ComponentChildren
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div class="overlay overlay-right" onClick={onClose}>
      <div class="drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <h3>{title}</h3>
          <button class="btn-icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div class="drawer-body">{children}</div>
      </div>
    </div>
  )
}

// ---------- Page header ----------
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ComponentChildren
}) {
  return (
    <div class="page-head">
      <div>
        <h1 class="page-title">{title}</h1>
        {subtitle && <p class="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div class="page-actions">{actions}</div>}
    </div>
  )
}
