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
