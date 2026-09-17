import { useEffect, useMemo, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiError, API_BASE, createTemplate } from '../api'
import type { Channel } from '../types'
import { CHANNELS } from '../util'
import { clearDraft, readDraft, writeDraft } from '../draft'
import { ChannelFields, variablesFor, type ChannelValues } from '../components/ChannelFields'
import { TemplatePreview } from '../components/TemplatePreview'
import { BackLink, Breadcrumbs, CardHead, Modal, PageHeader } from '../components/ui'

const CHANNEL_LABELS: Record<Channel, string> = { email: 'Email', sms: 'SMS', push: 'Push' }

const DRAFT_KEY = 'notifyr:new-template'

interface TemplateDraft {
  templateKey: string
  name: string
  enabled: Record<Channel, boolean>
  content: Record<Channel, ChannelValues>
  activeTab: Channel
  sampleValues: Partial<Record<Channel, Record<string, string>>>
}

function restoreDraft(): TemplateDraft | null {
  const saved = readDraft<Partial<TemplateDraft>>(DRAFT_KEY)
  if (!saved || typeof saved !== 'object') return null

  const enabled = {} as Record<Channel, boolean>
  const content = {} as Record<Channel, ChannelValues>
  for (const ch of CHANNELS) {
    enabled[ch] = saved.enabled?.[ch] === true
    const stored = saved.content?.[ch]
    content[ch] = stored && typeof stored === 'object' ? stored : {}
  }

  return {
    templateKey: typeof saved.templateKey === 'string' ? saved.templateKey : '',
    name: typeof saved.name === 'string' ? saved.name : '',
    enabled,
    content,
    activeTab: CHANNELS.includes(saved.activeTab as Channel) ? (saved.activeTab as Channel) : 'email',
    sampleValues:
      saved.sampleValues && typeof saved.sampleValues === 'object' ? saved.sampleValues : {},
  }
}

export function TemplateNew(_props: { path?: string }) {
  const { selectedProject, projectsLoading } = useStore()
  const draft = useMemo(() => {
    try {
      return restoreDraft()
    } catch {
      clearDraft(DRAFT_KEY)
      return null
    }
  }, [])

  const [templateKey, setTemplateKey] = useState(draft?.templateKey ?? '')
  const [name, setName] = useState(draft?.name ?? '')
  // Nothing pre-selected: which channels a template supports is a real
  // decision, not something to inherit silently and discover after sending.
  const [enabled, setEnabled] = useState<Record<Channel, boolean>>(
    draft?.enabled ?? { email: false, sms: false, push: false }
  )
  const [content, setContent] = useState<Record<Channel, ChannelValues>>(
    draft?.content ?? { email: {}, sms: {}, push: {} }
  )
  const [activeTab, setActiveTab] = useState<Channel>(draft?.activeTab ?? 'email')
  // Preview-only stand-ins for the {{variables}}. Never submitted, never saved.
  // Held per channel: each channel is sent on its own, with its own variables,
  // so email's {{variable_1}} and the SMS's are different things.
  const [sampleValues, setSampleValues] = useState<Partial<Record<Channel, Record<string, string>>>>(
    draft?.sampleValues ?? {}
  )

  const hasContent = Boolean(
    templateKey || name.trim() || CHANNELS.some((ch) => enabled[ch])
  )

  useEffect(() => () => clearDraft(DRAFT_KEY), [])

  useEffect(() => {
    if (!hasContent) return

    const intercept = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return
      }
      const target = e.target as HTMLElement | null
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.closest('.preview-panel')) return

      const href = anchor.getAttribute('href') ?? ''
      if (!href.startsWith('/') || href.startsWith('//') || href === '/templates/new') return

      e.preventDefault()
      e.stopPropagation()
      setPendingExit(href)
    }

    document.addEventListener('click', intercept, true)
    return () => document.removeEventListener('click', intercept, true)
  }, [hasContent])

  useEffect(() => {
    if (!hasContent) {
      clearDraft(DRAFT_KEY)
      return
    }

    writeDraft(DRAFT_KEY, {
      templateKey,
      name,
      enabled,
      content,
      activeTab,
      sampleValues,
    } satisfies TemplateDraft)
  }, [hasContent, templateKey, name, enabled, content, activeTab, sampleValues])

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
  const [pendingExit, setPendingExit] = useState<string | null>(null)

  if (!projectsLoading && !selectedProject) {
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

  const save = async () => {
    if (!selectedProject) return
    setBanner(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      const created = await createTemplate(selectedProject._id, assembleBody())
      clearDraft(DRAFT_KEY)
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

  const submit = (e: Event) => {
    e.preventDefault()
    void save()
  }

  const leave = (href: string) => {
    if (hasContent) {
      setPendingExit(href)
      return
    }
    route(href)
  }

  const discardAndLeave = () => {
    const href = pendingExit ?? '/templates'
    setPendingExit(null)
    clearDraft(DRAFT_KEY)
    route(href)
  }

  const saveAndLeave = () => {
    setPendingExit(null)
    void save()
  }

  return (
    <div>
      <BackLink href="/templates" label="Back to templates" onClick={() => leave('/templates')} />
      <Breadcrumbs trail={['Templates', selectedProject?.name ?? '…']} current="New template" />

      <div class="page-head">
        <div>
          <h1 class="page-title page-title-row">
            New template
            {selectedProject && <span class="chip">{selectedProject.name}</span>}
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
              <button type="submit" class="btn btn-primary" disabled={submitting || !selectedProject}>
                {submitting ? 'Creating…' : 'Create template'}
              </button>
              <button
                type="button"
                class="btn"
                disabled={submitting}
                onClick={() => leave('/templates')}
              >
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

      {pendingExit && (
        <Modal title="Save this template?" onClose={() => setPendingExit(null)} width={430}>
          <p class="confirm-message">
            This template hasn't been created yet. Save it before leaving, or discard what you've
            typed?
          </p>
          <div class="form-actions">
            <button type="button" class="btn btn-primary" disabled={submitting} onClick={saveAndLeave}>
              {submitting ? 'Saving…' : 'Yes, save it'}
            </button>
            <button type="button" class="btn" disabled={submitting} onClick={discardAndLeave}>
              No, discard
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
