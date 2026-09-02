import { useEffect, useRef } from 'preact/hooks'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'

/**
 * Word/Excel-style rich text editor for the email HTML body field.
 *
 * Built directly on TipTap's framework-agnostic core (not @tiptap/react),
 * mounted via a plain ref + useEffect. This avoids any React-hook
 * compatibility question under Preact entirely — TipTap owns its own DOM
 * subtree inside the container div, the same safe pattern any non-Preact
 * library (Quill, CodeMirror, etc.) uses to coexist with a VDOM framework.
 *
 * Output is a plain HTML string via editor.getHTML() — the exact same
 * format the backend already expects for html_body. {{variable}} tokens
 * are inserted as literal text, so the existing variable-detection regex
 * and render engine need zero changes.
 */

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const editor = new Editor({
      element: containerRef.current,
      extensions: [
        StarterKit,
        Underline,
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        Placeholder.configure({ placeholder: placeholder ?? 'Write the email body…' }),
      ],
      content: value,
      onUpdate: ({ editor }) => {
        onChange(editor.getHTML())
      },
    })

    editorRef.current = editor
    return () => editor.destroy()
    // Mount once — the editor then owns its own content/undo history.
    // Safe only because both callers (TemplateNew/TemplateEdit) already gate
    // rendering this component until `value` holds its real starting content
    // — TemplateNew starts empty, TemplateEdit waits for the fetch to finish
    // before mounting ChannelFields at all. If a future caller ever renders
    // this before its real value is known, this will need a second effect
    // that calls editor.commands.setContent() when `value` changes externally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = (fn: (editor: Editor) => void) => {
    const editor = editorRef.current
    if (!editor) return
    fn(editor)
  }

  return (
    <div class="rte">
      <div class="rte-toolbar">
        <button type="button" class="rte-btn" onClick={() => run((e) => e.chain().focus().toggleBold().run())}>
          <b>B</b>
        </button>
        <button type="button" class="rte-btn" onClick={() => run((e) => e.chain().focus().toggleItalic().run())}>
          <i>I</i>
        </button>
        <button type="button" class="rte-btn" onClick={() => run((e) => e.chain().focus().toggleUnderline().run())}>
          <u>U</u>
        </button>

        <span class="rte-sep" />

        <label class="rte-color-picker" title="Text color">
          A
          <input
            type="color"
            onInput={(e) => run((editor) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run())}
          />
        </label>

        <label class="rte-color-picker rte-color-picker-hl" title="Highlight color">
          ⬛
          <input
            type="color"
            onInput={(e) =>
              run((editor) => editor.chain().focus().toggleHighlight({ color: (e.target as HTMLInputElement).value }).run())
            }
          />
        </label>
      </div>

      <div ref={containerRef} class="rte-content" />
    </div>
  )
}
