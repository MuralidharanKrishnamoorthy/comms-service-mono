import { useRef, useState } from 'preact/hooks'
import type { Channel } from '../types'
import { ApiError, uploadImage } from '../api'
import {
  extractVariables,
  isRichTextSafe,
  invalidVariableTokens,
  nextVariableToken,
  suggestVariableName,
  SWATCH_COUNT,
} from '../util'
import { RichTextEditor } from './RichTextEditor'
import {
  BulletListIcon,
  ColorPicker,
  EmojiButton,
  MarkerIcon,
  OrderedListIcon,
  PaperclipIcon,
} from './editorIcons'

function HtmlSourceEditor({
  value,
  onChange,
  invalid,
  variableToken,
}: {
  value: string
  onChange: (html: string) => void
  invalid: boolean
  variableToken: string
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [textColor, setTextColor] = useState<string | null>(null)
  const [highlightColor, setHighlightColor] = useState<string | null>(null)

  // Puts the caret back where the author expects it after we rewrite the whole
  // textarea value — without this it jumps to the end on every toolbar click.
  const restoreCaret = (at: number) => {
    requestAnimationFrame(() => {
      const el = taRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(at, at)
    })
  }

  const wrap = (open: string, close: string) => {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart ?? value.length
    const end = ta.selectionEnd ?? value.length
    const selected = value.slice(start, end) || 'text'
    onChange(value.slice(0, start) + open + selected + close + value.slice(end))
    restoreCaret(start + open.length + selected.length + close.length)
  }

  const insertAtCursor = (text: string, caretOffset = text.length) => {
    const ta = taRef.current
    const start = ta?.selectionStart ?? value.length
    const end = ta?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + text + value.slice(end))
    restoreCaret(start + caretOffset)
  }

  const insertVariable = () => insertAtCursor(variableToken)

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
      insertAtCursor(`<img src="${url}" style="max-width:100%;" alt="" />`)
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Image upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div class="rte">
      <textarea
        ref={taRef}
        class={`mono rte-html-source ${invalid ? 'invalid' : ''}`}
        rows={12}
        value={value}
        placeholder="<div>Hi {{user_name}}, ...</div>"
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
      />

      {uploadError && <div class="field-error" style={{ padding: '6px 14px' }}>{uploadError}</div>}

      <div class="rte-toolbar">
        <button type="button" class="btn btn-sm rte-var-btn" onClick={insertVariable}>
          + Add variable
        </button>

        <span class="rte-sep" />

        <EmojiButton onPick={(emoji) => insertAtCursor(emoji)} />

        <button type="button" class="rte-btn" onClick={() => wrap('<b>', '</b>')}>
          <b>B</b>
        </button>
        <button type="button" class="rte-btn" onClick={() => wrap('<i>', '</i>')}>
          <i>I</i>
        </button>
        <button type="button" class="rte-btn" onClick={() => wrap('<u>', '</u>')}>
          <u>U</u>
        </button>

        <span class="rte-sep" />

        <ColorPicker
          title="Text colour"
          glyph="A"
          color={textColor}
          onPick={(value) => {
            setTextColor(value)
            wrap(`<span style="color:${value}">`, '</span>')
          }}
        />

        <ColorPicker
          title="Highlight colour"
          glyph={<MarkerIcon />}
          color={highlightColor}
          onPick={(value) => {
            setHighlightColor(value)
            wrap(`<span style="background-color:${value}">`, '</span>')
          }}
        />

        <span class="rte-sep" />

        <button type="button" class="rte-btn" title="Bulleted list" onClick={() => wrap('<ul><li>', '</li></ul>')}>
          <BulletListIcon />
        </button>
        <button type="button" class="rte-btn" title="Numbered list" onClick={() => wrap('<ol><li>', '</li></ol>')}>
          <OrderedListIcon />
        </button>

        <span class="rte-sep" />

        <button type="button" class="rte-btn" title="Attach image" disabled={uploading} onClick={pickImage}>
          {uploading ? '…' : <PaperclipIcon />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          style={{ display: 'none' }}
          onChange={onFileChosen}
        />

        <span class="rte-count">Character count = {value.length}</span>
      </div>
    </div>
  )
}

export interface ChannelValues {
  subject?: string
  html_body?: string
  title?: string
  body?: string
}

// Variables are auto-detected from whatever content this channel has — the
// person never types variable names separately, they just type {{name}}
// wherever it belongs and it's picked up automatically.
export function variablesFor(channel: Channel, v: ChannelValues): string[] {
  if (channel === 'email') return extractVariables(v.subject, v.html_body)
  if (channel === 'sms') return extractVariables(v.body)
  return extractVariables(v.title, v.body)
}

// Same content, but the braces that won't work.
function invalidFor(channel: Channel, v: ChannelValues): string[] {
  if (channel === 'email') return invalidVariableTokens(v.subject, v.html_body)
  if (channel === 'sms') return invalidVariableTokens(v.body)
  return invalidVariableTokens(v.title, v.body)
}

/**
 * One row per detected variable, where you type the value the preview should
 * stand in for it. These never leave the browser — they are an authoring aid,
 * not part of the template.
 */
function SampleValues({
  vars,
  invalid,
  values,
  onChange,
}: {
  vars: string[]
  invalid: string[]
  values: Record<string, string>
  onChange: (name: string, value: string) => void
}) {
  return (
    <div class="sample-block">
      <div class="sample-head">Sample values</div>
      <p class="card-help">
        Preview only — never saved, never sent. The real values arrive at send time in the{' '}
        <span class="mono">data</span> object of the API call, from your own database.
      </p>

      {invalid.length > 0 && (
        <div class="banner-warning" style={{ margin: '12px 0 0' }}>
          {invalid.map((token) => (
            <div key={token}>
              <span class="mono">{token}</span> can't be a variable — use letters, numbers and
              underscores only, like <span class="mono">{`{{${suggestVariableName(token)}}}`}</span>.
              As typed it is sent as plain text, not replaced.
            </div>
          ))}
        </div>
      )}

      {vars.length === 0 ? (
        <p class="card-help" style={{ marginTop: 10 }}>
          No variables yet. Type <span class="mono">{'{{name}}'}</span> in the content above and a
          row appears here.
        </p>
      ) : (
        <div class="sample-list">
          {vars.map((v, i) => (
            <div key={v} class="sample-row">
              <span class="sample-key mono">{`{{${v}}}`}</span>
              <input
                type="text"
                class={`var-swatch-${i % SWATCH_COUNT}`}
                value={values[v] ?? ''}
                placeholder="Enter sample value"
                onInput={(e) => onChange(v, (e.target as HTMLInputElement).value)}
              />
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

export function ChannelFields({
  channel,
  values,
  errors,
  onChange,
  sampleValues,
  onSampleChange,
}: {
  channel: Channel
  values: ChannelValues
  errors?: Record<string, string | undefined>
  onChange: (patch: ChannelValues) => void
  /** This channel's samples only — each channel is sent separately. */
  sampleValues: Record<string, string>
  onSampleChange: (name: string, value: string) => void
}) {
  const vars = variablesFor(channel, values)
  const err = (k: string) => errors?.[k]

  // Numbered within this channel. Each channel is its own message with its own
  // variables list and its own data at send time, so email's {{variable_1}} and
  // the SMS's are unrelated — and their samples are held separately to match.
  const variableToken = nextVariableToken(vars)

  const samples = (
    <SampleValues
      vars={vars}
      invalid={invalidFor(channel, values)}
      values={sampleValues}
      onChange={onSampleChange}
    />
  )

  // The body has two input modes: a WYSIWYG editor for people who just type
  // plain English, and a raw HTML source view for anyone building a fully
  // custom layout. Both edit the same string — switching modes hands the other
  // editor whatever was last typed. `richSyncKey` forces the rich-text editor
  // to remount (and re-parse the value fresh) whenever we switch back from
  // HTML mode, since it otherwise only reads its `value` prop once on mount.
  const [bodyMode, setBodyMode] = useState<'rich' | 'html'>('rich')
  const [richSyncKey, setRichSyncKey] = useState(0)

  // The single-line fields have no editor to ask, so "+ Add variable" splices
  // the token in at the selection and restores the caret after it.
  const subjectRef = useRef<HTMLInputElement>(null)

  const insertInto = (
    field: 'subject' | 'title',
    ref: { current: HTMLInputElement | null },
    text: string
  ) => {
    const current = values[field] ?? ''
    const el = ref.current
    const start = el?.selectionStart ?? current.length
    const end = el?.selectionEnd ?? current.length

    onChange({ [field]: current.slice(0, start) + text + current.slice(end) })

    const caretAt = start + text.length
    requestAnimationFrame(() => {
      const node = ref.current
      if (!node) return
      node.focus()
      node.setSelectionRange(caretAt, caretAt)
    })
  }


  /**
   * The body editor, identical on every channel. `field` differs because email
   * stores its body as html_body and the other two as body.
   */
  const bodyEditor = (field: 'html_body' | 'body', label: string, placeholder: string) => {
    // Markup the rich editor would flatten can only be edited as source, so
    // the mode follows the content rather than waiting to destroy it.
    const richSafe = isRichTextSafe(values[field] ?? '')
    const mode = richSafe ? bodyMode : 'html'

    return (
    <div class="field">
      <div class="field-label-row">
        <label style={{ marginBottom: 0 }}>{label}</label>
        <div class="mode-toggle">
          <button
            type="button"
            class={`mode-toggle-btn ${mode === 'rich' ? 'active' : ''}`}
            disabled={!richSafe}
            title={
              richSafe
                ? undefined
                : 'This layout uses tables or styles the text editor cannot keep. Editing it there would flatten it, so it stays in HTML.'
            }
            onClick={() => {
              setRichSyncKey((k) => k + 1)
              setBodyMode('rich')
            }}
          >
            Text
          </button>
          <button
            type="button"
            class={`mode-toggle-btn ${mode === 'html' ? 'active' : ''}`}
            onClick={() => setBodyMode('html')}
          >
            HTML
          </button>
        </div>
      </div>

      {mode === 'rich' ? (
        <RichTextEditor
          key={`${channel}-${richSyncKey}`}
          value={values[field] ?? ''}
          onChange={(html) => onChange({ [field]: html })}
          placeholder={placeholder}
          variableToken={variableToken}
        />
      ) : (
        <HtmlSourceEditor
          value={values[field] ?? ''}
          onChange={(html) => onChange({ [field]: html })}
          invalid={!!err(field)}
          variableToken={variableToken}
        />
      )}

      {err(field) && <div class="field-error">{err(field)}</div>}

      {!richSafe && (
        <p class="card-help">
          Editing as HTML — this layout uses markup the text editor can't keep.
        </p>
      )}
    </div>
    )
  }

  if (channel === 'email') {
    return (
      <div>
        <div class="field">
          <div class="subject-row">
            <div class="ff">
              <input
                ref={subjectRef}
                type="text"
                id="tpl-subject"
                value={values.subject ?? ''}
                placeholder=" "
                class={err('subject') ? 'invalid' : ''}
                onInput={(e) => onChange({ subject: (e.target as HTMLInputElement).value })}
              />
              <label for="tpl-subject">Subject</label>
            </div>
            <button
              type="button"
              class="btn btn-sm rte-var-btn"
              onClick={() => insertInto('subject', subjectRef, variableToken)}
            >
              + Add variable
            </button>
          </div>
          <p class="card-help">
            Variables work here too — <span class="mono">{'Welcome aboard, {{user_name}}'}</span>
          </p>
          {err('subject') && <div class="field-error">{err('subject')}</div>}
        </div>

        {bodyEditor('html_body', 'Email body', 'Write the email here — type {{params}} for a placeholder')}

        {samples}
      </div>
    )
  }

  if (channel === 'sms') {
    return (
      <div>
        {bodyEditor('body', 'Message body', 'Hi {{user_name}}, your code is {{code}}.')}

        {samples}
      </div>
    )
  }

  // push
  return (
    <div>
      <div class="field">
        <div class="subject-row">
          <div class="ff">
            <input
              ref={subjectRef}
              type="text"
              id="tpl-push-title"
              value={values.title ?? ''}
              placeholder=" "
              onInput={(e) => onChange({ title: (e.target as HTMLInputElement).value })}
            />
            <label for="tpl-push-title">Title (optional)</label>
          </div>
          <button
            type="button"
            class="btn btn-sm rte-var-btn"
            onClick={() => insertInto('title', subjectRef, variableToken)}
          >
            + Add variable
          </button>
        </div>
      </div>

      {bodyEditor('body', 'Body', 'Hi {{user_name}}, your order is on the way.')}


      {samples}
    </div>
  )
}
