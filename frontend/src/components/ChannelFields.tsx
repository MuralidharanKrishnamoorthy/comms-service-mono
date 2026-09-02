import { useRef, useState } from 'preact/hooks'
import type { Channel } from '../types'
import { extractVariables } from '../util'
import { RichTextEditor } from './RichTextEditor'

// Raw HTML source editor with a small formatting toolbar. Buttons wrap the
// current text selection in the matching tag (or a <span style="..."> for
// color/highlight) rather than trying to run a live WYSIWYG over raw markup.
function HtmlSourceEditor({
  value,
  onChange,
  invalid,
}: {
  value: string
  onChange: (html: string) => void
  invalid: boolean
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)

  const wrap = (open: string, close: string) => {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart ?? value.length
    const end = ta.selectionEnd ?? value.length
    const selected = value.slice(start, end) || 'text'
    const next = value.slice(0, start) + open + selected + close + value.slice(end)
    onChange(next)
    const caretAt = start + open.length + selected.length + close.length
    requestAnimationFrame(() => {
      const el = taRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(caretAt, caretAt)
    })
  }

  return (
    <div class="rte">
      <div class="rte-toolbar">
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

        <label class="rte-color-picker" title="Text color">
          A
          <input type="color" onInput={(e) => wrap(`<span style="color:${(e.target as HTMLInputElement).value}">`, '</span>')} />
        </label>

        <label class="rte-color-picker rte-color-picker-hl" title="Highlight color">
          ⬛
          <input
            type="color"
            onInput={(e) => wrap(`<span style="background-color:${(e.target as HTMLInputElement).value}">`, '</span>')}
          />
        </label>
      </div>

      <textarea
        ref={taRef}
        class={`mono rte-html-source ${invalid ? 'invalid' : ''}`}
        rows={12}
        value={value}
        placeholder="<div>Hi {{user_name}}, ...</div>"
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
      />
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

function VarList({ vars }: { vars: string[] }) {
  return (
    <div class="var-list">
      <span class="label-inline">Detected variables:</span>
      {vars.length === 0 ? (
        <span class="label-inline">none yet — type {'{{params}}'}</span>
      ) : (
        vars.map((v) => (
          <span key={v} class="chip">
            {v}
          </span>
        ))
      )}
    </div>
  )
}

export function ChannelFields({
  channel,
  values,
  errors,
  onChange,
}: {
  channel: Channel
  values: ChannelValues
  errors?: Record<string, string | undefined>
  onChange: (patch: ChannelValues) => void
}) {
  const vars = variablesFor(channel, values)
  const err = (k: string) => errors?.[k]

  // Email body has two input modes: a WYSIWYG rich-text editor for people who
  // just type plain English, and a raw HTML source view for anyone building
  // a fully custom template (tables, layout, styled buttons). Both edit the
  // same html_body string — switching modes hands the other editor whatever
  // was last typed. `richSyncKey` forces the rich-text editor to remount
  // (and re-parse html_body fresh) whenever we switch back from HTML mode,
  // since it otherwise only reads its `value` prop once on mount.
  const [emailMode, setEmailMode] = useState<'rich' | 'html'>('rich')
  const [richSyncKey, setRichSyncKey] = useState(0)

  if (channel === 'email') {
    return (
      <div>
        <div class="field">
          <label>Subject</label>
          <input
            type="text"
            value={values.subject ?? ''}
            placeholder="Welcome aboard, {{user_name}}"
            class={err('subject') ? 'invalid' : ''}
            onInput={(e) => onChange({ subject: (e.target as HTMLInputElement).value })}
          />
          {err('subject') && <div class="field-error">{err('subject')}</div>}
        </div>
        <div class="field">
          <div class="field-label-row">
            <label style={{ marginBottom: 0 }}>Email body</label>
            <div class="mode-toggle">
              <button
                type="button"
                class={`mode-toggle-btn ${emailMode === 'rich' ? 'active' : ''}`}
                onClick={() => {
                  setRichSyncKey((k) => k + 1)
                  setEmailMode('rich')
                }}
              >
                Text
              </button>
              <button
                type="button"
                class={`mode-toggle-btn ${emailMode === 'html' ? 'active' : ''}`}
                onClick={() => setEmailMode('html')}
              >
                HTML
              </button>
            </div>
          </div>
          {emailMode === 'rich' ? (
            <RichTextEditor
              key={richSyncKey}
              value={values.html_body ?? ''}
              onChange={(html) => onChange({ html_body: html })}
              placeholder="Write the email here — type {{params}} for a placeholder"
            />
          ) : (
            <HtmlSourceEditor
              value={values.html_body ?? ''}
              onChange={(html) => onChange({ html_body: html })}
              invalid={!!err('html_body')}
            />
          )}
          {err('html_body') && <div class="field-error">{err('html_body')}</div>}
        </div>

        <VarList vars={vars} />

        <label style={{ marginTop: 16 }}>Live preview</label>
        <div class="preview-box">
          <div class="preview-subject">
            {values.subject || '(no subject)'}
          </div>
          <div
            class="preview-html"
            // Preview only — content is authored by the internal team.
            dangerouslySetInnerHTML={{
              __html: values.html_body || '<em>(no body)</em>',
            }}
          />
        </div>
      </div>
    )
  }

  if (channel === 'sms') {
    const body = values.body ?? ''
    const count = body.length
    const over = count > 160
    return (
      <div>
        <div class="field">
          <label>Message body <span class="hint">(plain text)</span></label>
          <textarea
            rows={5}
            value={body}
            placeholder="Hi {{user_name}}, your code is {{code}}."
            class={err('body') ? 'invalid' : ''}
            onInput={(e) => onChange({ body: (e.target as HTMLTextAreaElement).value })}
          />
          {err('body') && <div class="field-error">{err('body')}</div>}
          <div class={`char-counter ${over ? 'over' : ''}`}>
            {count} characters{over ? ' — over the 160-char single-segment limit' : ''}
          </div>
        </div>

        <VarList vars={vars} />

        <label style={{ marginTop: 16 }}>Live preview</label>
        <div class="preview-box">
          <div class="preview-plain">{body || '(no body)'}</div>
        </div>
      </div>
    )
  }

  // push
  const body = values.body ?? ''
  return (
    <div>
      <div class="field">
        <label>Title <span class="hint">(optional)</span></label>
        <input
          type="text"
          value={values.title ?? ''}
          placeholder="Order shipped"
          onInput={(e) => onChange({ title: (e.target as HTMLInputElement).value })}
        />
      </div>
      <div class="field">
        <label>Body</label>
        <textarea
          rows={4}
          value={body}
          placeholder="Hi {{user_name}}, your order is on the way."
          class={err('body') ? 'invalid' : ''}
          onInput={(e) => onChange({ body: (e.target as HTMLTextAreaElement).value })}
        />
        {err('body') && <div class="field-error">{err('body')}</div>}
      </div>

      <VarList vars={vars} />

      <label style={{ marginTop: 16 }}>Live preview</label>
      <div class="preview-box">
        {values.title && <div class="preview-subject">{values.title}</div>}
        <div class="preview-plain">{body || '(no body)'}</div>
      </div>
    </div>
  )
}
