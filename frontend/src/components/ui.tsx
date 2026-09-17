import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { MessageStatus } from '../types'

export interface DropdownOption {
  value: string
  label: string
  // Secondary text shown muted beside the label in the option list, for when
  // the label alone is ambiguous — a template's key next to its name, say. The
  // trigger and the selected chips show the label on its own, so this can be
  // as long as it needs to be.
  hint?: string
  // A greyed-out, unselectable option (MultiSelect only) — e.g. a template that
  // is not yet approved and so may not be grouped. `disabledReason` explains why
  // in place of the hint.
  disabled?: boolean
  disabledReason?: string
}

export function Dropdown({
  value,
  onChange,
  options,
  disabled,
  placeholder,
  class: className,
  onClear,
}: {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  disabled?: boolean
  placeholder?: string
  class?: string

  onClear?: () => void
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

        {onClear && value && !disabled && (
          <span
            role="button"
            tabIndex={0}
            class="dropdown-clear"
            aria-label="Clear selection"
            title="Clear"
            onClick={(e) => {
              // Don't let the click fall through and toggle the menu open.
              e.stopPropagation()
              onClear()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                e.preventDefault()
                onClear()
              }
            }}
          >
            ×
          </span>
        )}
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
              {o.hint && <span class="dropdown-option-hint mono">{o.hint}</span>}
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

  const toggle = (v: string) => {
    const opt = options.find((o) => o.value === v)
    if (opt?.disabled) return
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])
  }

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
                  class={`dropdown-option ms-option ${checked ? 'selected' : ''} ${o.disabled ? 'ms-option-disabled' : ''}`}
                  role="option"
                  aria-selected={checked}
                  aria-disabled={o.disabled}
                  disabled={o.disabled}
                  title={o.disabled ? o.disabledReason : undefined}
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
                  {(o.disabled ? o.disabledReason : o.hint) && (
                    <span class="dropdown-option-hint mono">
                      {o.disabled ? o.disabledReason : o.hint}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Shared action icons ----------
// Hand-drawn rather than pulled from an icon package, matching the rest of
// this app (see BackLink below, NavIcon in app.tsx). Sized by their container.
export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  )
}

export function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// A return / undo arrow — curves back to the left, for "send back for edits".
export function ReturnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10H9" />
    </svg>
  )
}

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
// `label` overrides the visible text while the colour still comes from the real
// `status` — e.g. showing "pending approval" without changing the amber pill.
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const cls =
    status === 'sent' || status === 'delivered' || status === 'active' || status === 'approved'
      ? 'badge-success'
      : status === 'failed' || status === 'revoked' || status === 'rejected'
        ? 'badge-danger'
        : status === 'returned'
          ? 'badge-info'
          : status === 'pending' || status === 'expired'
            ? 'badge-warning'
            : 'badge-neutral'
  return <span class={`badge ${cls}`}>{label ?? status}</span>
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

// ---------- Toast ----------
// A single transient confirmation, pinned bottom-right. Presentational only —
// the owner holds the message in state and clears it on a timer.
export type ToastTone = 'success' | 'error'

export function useToast(durationMs = 2800) {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const showToast = (message: string, tone: ToastTone = 'success') => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ message, tone })
    timer.current = window.setTimeout(() => setToast(null), durationMs)
  }

  return { toast, showToast }
}

export function Toast({
  message,
  tone = 'success',
}: {
  message: string
  tone?: ToastTone
}) {
  return (
    <div class="toast-viewport">
      <div class={`toast toast-${tone}`} role="status" aria-live="polite">
        {message}
      </div>
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

// ---------- Breadcrumb trail ----------
export function Breadcrumbs({ trail, current }: { trail: string[]; current: string }) {
  return (
    <div class="crumbs">
      {trail.map((step) => (
        <span key={step} class="crumb">
          {step}
          <span class="crumb-sep">/</span>
        </span>
      ))}
      <span class="crumb-current">{current}</span>
    </div>
  )
}

// ---------- Card heading ----------
// Title, one line of guidance, and an optional hover-help mark — the repeating
// top of every card on the template editor.
export function CardHead({
  title,
  required,
  hint,
  help,
}: {
  title: string
  required?: boolean
  hint?: ComponentChildren
  help?: string
}) {
  return (
    <div class="card-head">
      <div>
        <div class="card-title">
          {title}
          {required && <span class="card-req">*</span>}
        </div>
        {hint && <p class="card-help">{hint}</p>}
      </div>
      {help && (
        <span class="card-help-icon" title={help} aria-label={help}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
        </span>
      )}
    </div>
  )
}
