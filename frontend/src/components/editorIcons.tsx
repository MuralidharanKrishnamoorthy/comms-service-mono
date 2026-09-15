import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

// Toolbar glyphs shared by the rich-text and HTML-source editors. Hand-drawn
// on a 24x24 grid in the same stroked style as the rest of the app's icons,
// following the shapes people already recognise from other editors.

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
}

// Three rules with a dot against each — the dots are drawn as zero-length
// round-capped lines so they stay perfectly circular at any size.
export function BulletListIcon() {
  return (
    <svg {...stroke}>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <g stroke-width="3.2">
        <line x1="4" y1="6" x2="4.01" y2="6" />
        <line x1="4" y1="12" x2="4.01" y2="12" />
        <line x1="4" y1="18" x2="4.01" y2="18" />
      </g>
    </svg>
  )
}

// Same rules, with a legible 1 and 2 down the left.
export function OrderedListIcon() {
  return (
    <svg {...stroke}>
      <line x1="10" y1="6" x2="20" y2="6" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="10" y1="18" x2="20" y2="18" />
      <g stroke-width="1.7">
        <path d="M4 4.6 5.4 4v5" />
        <path d="M4.1 9h2.4" />
        <path d="M4 15.1c.2-.7.8-1.1 1.5-1.1.8 0 1.4.5 1.4 1.2 0 1.3-2.9 1.9-2.9 3.8h3" />
      </g>
    </svg>
  )
}

// A marker nib — reads as "highlight" rather than as a plain filled square.
export function MarkerIcon() {
  return (
    <svg {...stroke}>
      <path d="M14.5 3.5a2.1 2.1 0 0 1 3 3L8 16l-3.5.9L5.4 13z" />
      <line x1="3" y1="21" x2="21" y2="21" />
    </svg>
  )
}

function SmileyIcon() {
  return (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <line x1="9" y1="9.5" x2="9.01" y2="9.5" stroke-width="2.6" />
      <line x1="15" y1="9.5" x2="15.01" y2="9.5" stroke-width="2.6" />
    </svg>
  )
}

const EMOJI = [
  '😀', '😊', '😍', '🥳', '👍', '👏', '🙏', '❤️',
  '🎉', '🎊', '🎁', '⭐', '✨', '🔥', '✅', '❗',
  '⚠️', '📣', '📢', '📦', '🚚', '🛒', '💳', '💰',
  '📅', '⏰', '📍', '📞', '✉️', '🔗',
]

const MENU_WIDTH = 236
const MENU_HEIGHT = 150

/**
 * The one formatting control that means anything on a plain-text channel.
 *
 * The menu is positioned `fixed` from the button's measured box rather than
 * absolutely: the toolbar scrolls horizontally and `.rte` clips, so an
 * absolutely-positioned menu would be cut off by both.
 */
export function EmojiButton({ onPick }: { onPick: (emoji: string) => void }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!at) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setAt(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAt(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [at])

  const toggle = () => {
    if (at) {
      setAt(null)
      return
    }
    const box = btnRef.current?.getBoundingClientRect()
    if (!box) return

    // Open upward, but flip below when the toolbar sits near the top.
    const top = box.top - MENU_HEIGHT - 6 < 8 ? box.bottom + 6 : box.top - MENU_HEIGHT - 6
    const left = Math.max(8, Math.min(box.left, window.innerWidth - MENU_WIDTH - 8))
    setAt({ left, top })
  }

  return (
    <div class="emoji-wrap" ref={wrapRef}>
      <button ref={btnRef} type="button" class="rte-btn" title="Emoji" onClick={toggle}>
        <SmileyIcon />
      </button>
      {at && (
        <div class="emoji-menu" style={{ left: at.left, top: at.top }}>
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              class="emoji-cell"
              title={emoji}
              onClick={() => {
                onPick(emoji)
                setAt(null)
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function PaperclipIcon() {
  return (
    <svg {...stroke}>
      <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.19 9.19a1 1 0 0 1-1.41-1.41l8.48-8.48" />
    </svg>
  )
}

/**
 * A colour control: the glyph it applies to, over a bar showing the colour.
 * The bar starts as a spectrum so it reads as "pick a colour" — a solid black
 * swatch just looks like an unexplained dark square. Once a colour has been
 * chosen the bar shows that colour instead.
 */
export function ColorPicker({
  title,
  glyph,
  color,
  onPick,
}: {
  title: string
  glyph: ComponentChildren
  color: string | null
  onPick: (value: string) => void
}) {
  return (
    <label class="rte-color-picker" title={title}>
      <span class="rte-color-glyph">{glyph}</span>
      <span class="rte-color-bar" style={color ? { background: color } : undefined} />
      <input
        type="color"
        value={color ?? '#c4841f'}
        aria-label={title}
        onInput={(e) => onPick((e.target as HTMLInputElement).value)}
      />
    </label>
  )
}
