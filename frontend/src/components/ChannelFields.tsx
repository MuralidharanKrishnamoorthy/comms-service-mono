import type { Channel } from '../types'
import { extractVariables, renderSample } from '../util'

export interface ChannelValues {
  subject?: string
  html_body?: string
  title?: string
  body?: string
}

// Variables are auto-detected from whatever content this channel has — the
// person never types variable names separately.
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
        <span class="label-inline">none yet — type {'{{like_this}}'}</span>
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
          <label>
            HTML body <span class="hint">(real HTML — rendered in the preview below)</span>
          </label>
          <textarea
            rows={8}
            value={values.html_body ?? ''}
            placeholder={'<h1>Hi {{user_name}}</h1>\n<p>Your code is {{code}}.</p>'}
            class={err('html_body') ? 'invalid' : ''}
            onInput={(e) => onChange({ html_body: (e.target as HTMLTextAreaElement).value })}
          />
          {err('html_body') && <div class="field-error">{err('html_body')}</div>}
        </div>

        <VarList vars={vars} />

        <label style={{ marginTop: 16 }}>Live preview</label>
        <div class="preview-box">
          <div class="preview-subject">
            {values.subject ? renderSample(values.subject, vars) : '(no subject)'}
          </div>
          <div
            class="preview-html"
            // Preview only — content is authored by the internal team.
            dangerouslySetInnerHTML={{
              __html: renderSample(values.html_body ?? '', vars) || '<em>(no body)</em>',
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
          <div class="preview-plain">{renderSample(body, vars) || '(no body)'}</div>
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
        {values.title && <div class="preview-subject">{renderSample(values.title, vars)}</div>}
        <div class="preview-plain">{renderSample(body, vars) || '(no body)'}</div>
      </div>
    </div>
  )
}
