import { useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiError, API_BASE, createTemplate } from '../api'
import type { Channel } from '../types'
import { CHANNELS } from '../util'
import { ChannelFields, variablesFor, type ChannelValues } from '../components/ChannelFields'
import { TemplatePreview } from '../components/TemplatePreview'
import { BackLink, Breadcrumbs, CardHead, PageHeader } from '../components/ui'

const CHANNEL_LABELS: Record<Channel, string> = { email: 'Email', sms: 'SMS', push: 'Push' }

export function TemplateNew(_props: { path?: string }) {
  const { selectedProject } = useStore()

  const [templateKey, setTemplateKey] = useState('')
  const [name, setName] = useState('')
  // Nothing pre-selected: which channels a template supports is a real
  // decision, not something to inherit silently and discover after sending.
  const [enabled, setEnabled] = useState<Record<Channel, boolean>>({
    email: false,
    sms: false,
    push: false,
  })
  const [content, setContent] = useState<Record<Channel, ChannelValues>>({
    email: {},
    sms: {},
    push: {},
  })
  const [activeTab, setActiveTab] = useState<Channel>('email')
  // Preview-only stand-ins for the {{variables}}. Never submitted, never saved.
  // Held per channel: each channel is sent on its own, with its own variables,
  // so email's {{variable_1}} and the SMS's are different things.
  const [sampleValues, setSampleValues] = useState<Partial<Record<Channel, Record<string, string>>>>(
    {}
  )

  const setSample = (ch: Channel) => (name: string, value: string) =>
    setSampleValues((s) => ({ ...s, [ch]: { ...(s[ch] ?? {}), [name]: value } }))

  /**
   * Turning a channel off discards its draft. It was never going to be
   * submitted — assembleBody skips disabled channels — and keeping it would
   * leave stale content in the preview and resurrect it on a re-tick.
   */
  const toggleChannel = (ch: Channel, on: boolean) => {
    setEnabled((prev) => ({ ...prev, [ch]: on }))

    if (on) {
      setActiveTab(ch)
      return
    }

    setContent((c) => ({ ...c, [ch]: {} }))
    setSampleValues((s) => ({ ...s, [ch]: {} }))
    setChannelErrors((e) => ({ ...e, [ch]: {} }))

    // Don't leave the tab sitting on a channel that no longer has content.
    if (activeTab === ch) {
      const next = CHANNELS.find((other) => other !== ch && enabled[other])
      if (next) setActiveTab(next)
    }
  }

  const [topErrors, setTopErrors] = useState<Record<string, string | undefined>>({})
  const [channelErrors, setChannelErrors] = useState<Record<Channel, Record<string, string>>>({
    email: {},
    sms: {},
    push: {},
  })
  const [channelsBanner, setChannelsBanner] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!selectedProject) {
    return (
      <div>
        <PageHeader title="New template" />
        <div class="empty">Select a project in the top bar first.</div>
      </div>
    )
  }

  const patchContent = (ch: Channel, patch: ChannelValues) =>
    setContent((c) => ({ ...c, [ch]: { ...c[ch], ...patch } }))

  const onKeyInput = (raw: string) => {
    setTemplateKey(raw.toUpperCase().replace(/[^A-Z0-9_]/g, ''))
  }

  const validate = (): boolean => {
    const te: Record<string, string> = {}
    const ce: Record<Channel, Record<string, string>> = { email: {}, sms: {}, push: {} }
    let banner: string | null = null

    if (!templateKey) te.template_key = 'Template key is required.'
    else if (templateKey.length > 80) te.template_key = 'Template key must be 80 characters or fewer.'
    else if (!/^[A-Z0-9_]+$/.test(templateKey))
      te.template_key = 'Only A–Z, 0–9 and underscore are allowed.'

    if (!name.trim()) te.name = 'Name is required.'
    else if (name.trim().length > 120) te.name = 'Name must be 120 characters or fewer.'

    const activeChannels = CHANNELS.filter((c) => enabled[c])
    if (activeChannels.length === 0) {
      banner = 'Enable at least one channel and add content to it.'
    }

    for (const ch of activeChannels) {
      const v = content[ch]
      if (ch === 'email') {
        if (!v.subject?.trim()) ce.email.subject = 'Subject is required for email.'
        if (!v.html_body?.trim()) ce.email.html_body = 'HTML body is required for email.'
      } else if (ch === 'sms') {
        if (!v.body?.trim()) ce.sms.body = 'Message body is required for SMS.'
      } else {
        if (!v.body?.trim()) ce.push.body = 'Body is required for push.'
      }
    }

    setTopErrors(te)
    setChannelErrors(ce)
    setChannelsBanner(banner)

    const channelHasError = CHANNELS.some((c) => Object.keys(ce[c]).length > 0)
    if (channelHasError) {
      const firstBad = CHANNELS.find((c) => Object.keys(ce[c]).length > 0)
      if (firstBad) setActiveTab(firstBad)
    }
    return Object.keys(te).length === 0 && !banner && !channelHasError
  }

  const assembleBody = () => {
    const channels: Record<string, unknown> = {}
    for (const ch of CHANNELS) {
      if (!enabled[ch]) continue
      const v = content[ch]
      const variables = variablesFor(ch, v)
      if (ch === 'email') {
        channels.email = { subject: v.subject ?? '', html_body: v.html_body ?? '', variables }
      } else if (ch === 'sms') {
        channels.sms = { body: v.body ?? '', variables }
      } else {
        channels.push = { title: v.title ?? '', body: v.body ?? '', variables }
      }
    }
    return { template_key: templateKey, name: name.trim(), channels }
  }

  const applyServerErrors = (err: ApiError) => {
    const fe = err.details?.fieldErrors ?? {}
    const te: Record<string, string> = {}
    if (fe.template_key?.[0]) te.template_key = fe.template_key[0]
    if (fe.name?.[0]) te.name = fe.name[0]
    setTopErrors(te)
    if (fe.channels?.length) setChannelsBanner(fe.channels.join(' '))
    if (err.details?.formErrors?.length) setBanner(err.details.formErrors.join(' '))
  }

  const submit = async (e: Event) => {
    e.preventDefault()
    setBanner(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      const created = await createTemplate(selectedProject._id, assembleBody())
      route(`/templates/${created.template_key}`)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isNetwork) {
          setBanner(`Can't reach the API at ${API_BASE} — is the backend running?`)
        } else if (err.status === 409) {
          setTopErrors((prev) => ({
            ...prev,
            template_key: `A template with key "${templateKey}" already exists in this project.`,
          }))
          setActiveTab(activeTab)
        } else if (err.status === 400) {
          applyServerErrors(err)
          if (!err.details) setBanner(err.message)
        } else {
          setBanner(err.message)
        }
      } else {
        setBanner('Something went wrong.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <BackLink href="/templates" label="Back to templates" onClick={() => route('/templates')} />
      <Breadcrumbs trail={['Templates', selectedProject.name]} current="New template" />

      <div class="page-head">
        <div>
          <h1 class="page-title page-title-row">
            New template
            <span class="chip">{selectedProject.name}</span>
          </h1>
        </div>
      </div>

      {banner && <div class="banner-error">{banner}</div>}

      <form onSubmit={submit}>
        <div class="tpl-grid">
          <div class="tpl-form">
            <div class="card">
              <CardHead title="Template key" required />
              <div class="field" style={{ marginBottom: 0 }}>
                <div class="ff">
                  <input
                    type="text"
                    id="tpl-key"
                    class={`mono ${topErrors.template_key ? 'invalid' : ''}`}
                    value={templateKey}
                    placeholder=" "
                    onInput={(e) => onKeyInput((e.target as HTMLInputElement).value)}
                  />
                  <label for="tpl-key">Template key</label>
                </div>
                {topErrors.template_key && <div class="field-error">{topErrors.template_key}</div>}
              </div>
            </div>

            <div class="card">
              <CardHead title="Name" required />
              <div class="field" style={{ marginBottom: 0 }}>
                <div class="ff">
                  <input
                    type="text"
                    id="tpl-name"
                    value={name}
                    placeholder=" "
                    class={topErrors.name ? 'invalid' : ''}
                    onInput={(e) => setName((e.target as HTMLInputElement).value)}
                  />
                  <label for="tpl-name">Name</label>
                </div>
                {topErrors.name && <div class="field-error">{topErrors.name}</div>}
              </div>
            </div>

            <div class="card">
              <CardHead
                title="Channels"
                required
                hint="Pick every channel this template should be sendable on. Each one gets its own content."
                help="A channel with no content can't be sent, so enable only what you'll write."
              />

              <div class="chan-cards">
                {CHANNELS.map((ch) => (
                  <label key={ch} class={`chan-card ${enabled[ch] ? 'on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={enabled[ch]}
                      onChange={(e) => toggleChannel(ch, (e.target as HTMLInputElement).checked)}
                    />
                    <span class="chan-card-title">{CHANNEL_LABELS[ch]}</span>
                  </label>
                ))}
              </div>

              {channelsBanner && (
                <div class="banner-error" style={{ marginTop: 14, marginBottom: 0 }}>
                  {channelsBanner}
                </div>
              )}
            </div>

            <div class="card">
              <CardHead
                title="Content"
                required
                hint="Write each enabled channel. Type {{name}} anywhere you want a value filled in at send time."
              />

              <div class="tabs">
                {CHANNELS.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    class={`tab ${activeTab === ch ? 'active' : ''}`}
                    onClick={() => setActiveTab(ch)}
                  >
                    {enabled[ch] && <span class="tab-dot" />}
                    {CHANNEL_LABELS[ch]}
                  </button>
                ))}
              </div>

              {enabled[activeTab] ? (
                <ChannelFields
                  channel={activeTab}
                  values={content[activeTab]}
                  errors={channelErrors[activeTab]}
                  onChange={(patch) => patchContent(activeTab, patch)}
                  sampleValues={sampleValues[activeTab] ?? {}}
                  onSampleChange={setSample(activeTab)}
                />
              ) : (
                <div class="subtle" style={{ padding: '8px 0' }}>
                  {CHANNEL_LABELS[activeTab]} is disabled. Tick its card above to add content.
                </div>
              )}
            </div>

            <div class="form-actions" style={{ marginTop: 0 }}>
              <button type="submit" class="btn btn-primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create template'}
              </button>
              <button type="button" class="btn" onClick={() => route('/templates')} disabled={submitting}>
                Cancel
              </button>
            </div>
          </div>

          <aside class="tpl-preview">
            <TemplatePreview
              channel={activeTab}
              values={content[activeTab]}
              sampleValues={sampleValues[activeTab] ?? {}}
              disabled={!enabled[activeTab]}
            />
          </aside>
        </div>
      </form>
    </div>
  )
}
