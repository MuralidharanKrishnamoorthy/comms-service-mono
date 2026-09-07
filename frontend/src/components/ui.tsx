import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { MessageStatus } from '../types'

// ---------- Dropdown (native <select>'s open list can't be styled — its
// popup is rendered by the OS outside CSS reach in Chromium/Windows. This
// renders the whole thing in-page instead, so the open menu keeps the same
// rounded corners as everything else.) ----------
export interface DropdownOption {
  value: string
  label: string
}

export function Dropdown({
  value,
  onChange,
  options,
  disabled,
  placeholder,
  class: className,
}: {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  disabled?: boolean
  placeholder?: string
  class?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div class={`dropdown ${className ?? ''}`} ref={rootRef}>
      <button
        type="button"
        class="dropdown-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span class={selected ? '' : 'dropdown-placeholder'}>{selected?.label ?? placeholder ?? ''}</span>
        <svg class="dropdown-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div class="dropdown-menu" role="listbox">
          {options.map((o) => (
            <button
              type="button"
              key={o.value}
              class={`dropdown-option ${o.value === value ? 'selected' : ''}`}
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Shared action icons ----------
// Hand-drawn rather than pulled from an icon package, matching the rest of
// this app (see BackLink below, NavIcon in app.tsx). Sized by their container.
export function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

// ---------- Status badge ----------
export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'sent' || status === 'delivered' || status === 'active'
      ? 'badge-success'
      : status === 'failed' || status === 'revoked'
        ? 'badge-danger'
        : status === 'pending' || status === 'expired'
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

// ---------- Confirm dialog (in-app replacement for window.confirm) ----------
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  message: ComponentChildren
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel} width={420}>
      <div class="confirm-message">{message}</div>
      <div class="form-actions">
        <button
          type="button"
          class={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
        <button type="button" class="btn" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </Modal>
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

// ---------- Back navigation link ----------
export function BackLink({ href, label, onClick }: { href: string; label: string; onClick: () => void }) {
  return (
    <a
      class="back-link"
      href={href}
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
    >
      <svg class="back-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </a>
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
