import { useMemo } from 'preact/hooks'
import type { Channel } from '../types'
import { applyDeferredStyles, htmlToPlainText, substituteVariables, wrapEmailHtml } from '../util'
import { type ChannelValues } from './ChannelFields'

const CHANNEL_LABELS: Record<Channel, string> = { email: 'Email', sms: 'SMS', push: 'Push' }

/**
 * Shows the template the way it will read once sent: variables swapped for
 * their sample values, in ordinary text, because that is how they will arrive.
 * A variable with no sample yet keeps showing its {{token}}
 * rather than leaving a gap.
 */
export function TemplatePreview({
  channel,
  values,
  sampleValues,
  disabled,
}: {
  channel: Channel
  values: ChannelValues
  sampleValues: Record<string, string>
  /** The channel is switched off, so there is nothing to show for it. */
  disabled?: boolean
}) {
  // Stable for the life of the screen — a clock that re-ran on every keystroke
  // would flicker while you type.
  const time = useMemo(
    () => new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    []
  )

  const fill = (source: string | undefined, sourceIsHtml: boolean) =>
    substituteVariables(source ?? '', sampleValues, sourceIsHtml)

  // SMS and push go through exactly what the backend does before sending, so
  // the preview can't promise formatting that won't arrive. The deferred pass
  // runs last, styling the values that landed where styled {{tokens}} were.
  const fillPlain = (source: string | undefined) =>
    applyDeferredStyles(
      substituteVariables(htmlToPlainText(source ?? '', true), sampleValues, false),
      true
    )

  return (
    <div class="preview-panel">
      <div class="preview-panel-head">
        <span>Preview</span>
        <span>{CHANNEL_LABELS[channel]}</span>
      </div>

      {disabled ? (
        <div class="preview-off">
          {CHANNEL_LABELS[channel]} is switched off for this template.
        </div>
      ) : channel === 'email' ? (
        <>
          <div class="preview-subject">
            {values.subject ? (
              <span dangerouslySetInnerHTML={{ __html: fill(values.subject, false) }} />
            ) : (
              <span class="preview-empty">(no subject)</span>
            )}
          </div>
          <div
            class="preview-html"
            // Sample values are escaped by substituteVariables; the surrounding
            // body is template HTML authored in this dashboard.
            dangerouslySetInnerHTML={{
              __html: values.html_body
                ? wrapEmailHtml(fill(values.html_body, true))
                : '<em>(no body)</em>',
            }}
          />
        </>
      ) : (
        <div class="preview-stage">
          <div class="bubble">
            {channel === 'push' && values.title && (
              <div
                class="bubble-title"
                dangerouslySetInnerHTML={{ __html: fillPlain(values.title) }}
              />
            )}
            {values.body ? (
              <div
                class="bubble-body"
                dangerouslySetInnerHTML={{ __html: fillPlain(values.body) }}
              />
            ) : (
              <div class="bubble-body preview-empty">(no body)</div>
            )}
            <div class="bubble-time">{time}</div>
          </div>
        </div>
      )}
    </div>
  )
}
