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

// ---------- Multi-select dropdown (checkbox menu, same look as Dropdown) ----------
export function MultiSelect({
  values,
  onChange,
  options,
  disabled,
  placeholder = 'Select…',
  class: className,
}: {
  values: string[]
  onChange: (values: string[]) => void
  options: DropdownOption[]
  disabled?: boolean
  placeholder?: string
  class?: string
}) {
  const [open, setOpen] = useState(false)
  // When there isn't room below the trigger, open the menu upward so its rows
  // (and its scrollbar) never fall off the bottom of the viewport.
  const [dropUp, setDropUp] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const MENU_MAX = 200 // keep in sync with .ms-menu max-height

  const openMenu = () => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      setDropUp(spaceBelow < MENU_MAX + 16 && spaceAbove > spaceBelow)
    }
    setOpen(true)
  }

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

  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])

  const selectedOptions = options.filter((o) => values.includes(o.value))

  return (
    <div class={`dropdown ${className ?? ''}`} ref={rootRef}>
      <button
        type="button"
        class="dropdown-trigger"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        {selectedOptions.length === 0 ? (
          <span class="dropdown-placeholder">{placeholder}</span>
        ) : (
          <span class="ms-summary">
            {selectedOptions.map((o) => (
              <span key={o.value} class="chip ms-chip">
                {o.label}
                <span
                  role="button"
                  tabIndex={0}
                  class="ms-chip-x"
                  aria-label={`Remove ${o.label}`}
                  onClick={(e) => {
                    // Don't toggle the menu open/closed when removing a chip.
                    e.stopPropagation()
                    toggle(o.value)
                  }}
                >
                  ×
                </span>
              </span>
            ))}
          </span>
        )}
        <svg class="dropdown-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div class={`dropdown-menu ms-menu ${dropUp ? 'dropup' : ''}`} role="listbox" aria-multiselectable="true">
          {options.length === 0 ? (
            <div class="dropdown-option dropdown-empty">No options</div>
          ) : (
            options.map((o) => {
              const checked = values.includes(o.value)
              return (
                <button
                  type="button"
                  key={o.value}
                  class={`dropdown-option ms-option ${checked ? 'selected' : ''}`}
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(o.value)}
                >
                  <span class={`ms-check ${checked ? 'on' : ''}`} aria-hidden="true">
                    {checked && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </span>
                  {o.label}
                </button>
              )
            })
          )}
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
