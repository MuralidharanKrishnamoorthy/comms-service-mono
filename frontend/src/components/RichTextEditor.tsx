import { useEffect, useRef, useState } from 'preact/hooks'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { ApiError, uploadImage } from '../api'
import {
  BulletListIcon,
  ColorPicker,
  EmojiButton,
  MarkerIcon,
  OrderedListIcon,
  PaperclipIcon,
} from './editorIcons'

const SizedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: { default: 'max-width:100%;height:auto;border-radius:6px;' },
    }
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const wrapper = document.createElement('span')
      wrapper.className = 'rte-image-wrap'

      const img = document.createElement('img')
      img.src = node.attrs.src
      img.alt = node.attrs.alt ?? ''
      if (node.attrs.style) img.setAttribute('style', node.attrs.style)

      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'rte-image-remove'
      removeBtn.title = 'Remove image'
      removeBtn.textContent = '×'
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (typeof getPos !== 'function') return
        const pos = getPos()
        if (typeof pos !== 'number') return
        editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
      })

      wrapper.appendChild(img)
      wrapper.appendChild(removeBtn)

      return { dom: wrapper }
    }
  },
})

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  /** The token "+ Add variable" inserts, e.g. "{{3}}". */
  variableToken: string
}

export function RichTextEditor({ value, onChange, placeholder, variableToken }: RichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const [textColor, setTextColor] = useState<string | null>(null)
  const [highlightColor, setHighlightColor] = useState<string | null>(null)

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
        SizedImage,
      ],
      content: value,
      onUpdate: ({ editor }) => {
        onChange(editor.getHTML())
        setCount(editor.getText().length)
      },
    })

    editorRef.current = editor
    setCount(editor.getText().length)
    return () => editor.destroy()
  }, [])

  const run = (fn: (editor: Editor) => void) => {
    const editor = editorRef.current
    if (!editor) return
    fn(editor)
  }

  const insertVariable = () =>
    run((editor) => editor.chain().focus().insertContent(variableToken).run())

  const pickImage = () => fileInputRef.current?.click()

  const onFileChosen = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    setUploadError(null)
    setUploading(true)
    try {
      const { url } = await uploadImage(file)
      run((editor) => editor.chain().focus().setImage({ src: url }).run())
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Image upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div class="rte">
      {uploadError && <div class="field-error" style={{ padding: '6px 14px 0' }}>{uploadError}</div>}

      <div ref={containerRef} class="rte-content" />

      <div class="rte-toolbar">
        <button type="button" class="btn btn-sm rte-var-btn" onClick={insertVariable}>
          + Add variable
        </button>

        <span class="rte-sep" />

        <EmojiButton
          onPick={(emoji) => run((editor) => editor.chain().focus().insertContent(emoji).run())}
        />

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

        <ColorPicker
          title="Text colour"
          glyph="A"
          color={textColor}
          onPick={(value) => {
            setTextColor(value)
            run((editor) => editor.chain().focus().setColor(value).run())
          }}
        />

        <ColorPicker
          title="Highlight colour"
          glyph={<MarkerIcon />}
          color={highlightColor}
          onPick={(value) => {
            setHighlightColor(value)
            run((editor) => editor.chain().focus().toggleHighlight({ color: value }).run())
          }}
        />

        <span class="rte-sep" />

        <button
          type="button"
          class="rte-btn"
          title="Bulleted list"
          onClick={() => run((e) => e.chain().focus().toggleBulletList().run())}
        >
          <BulletListIcon />
        </button>
        <button
          type="button"
          class="rte-btn"
          title="Numbered list"
          onClick={() => run((e) => e.chain().focus().toggleOrderedList().run())}
        >
          <OrderedListIcon />
        </button>

        <span class="rte-sep" />

        <button type="button" class="rte-btn" title="Attach image" disabled={uploading} onClick={pickImage}>
          {uploading ? '…' : <PaperclipIcon />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: 'none' }}
          onChange={onFileChosen}
        />

        <span class="rte-count">Character count = {count}</span>
      </div>
    </div>
  )
}
