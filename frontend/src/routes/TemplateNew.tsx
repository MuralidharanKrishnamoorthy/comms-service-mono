import { useEffect, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiError, API_BASE, createTemplate, listCategories } from '../api'
import type { Channel } from '../types'
import { CHANNELS } from '../util'
import { ChannelFields, variablesFor, type ChannelValues } from '../components/ChannelFields'
import { PageHeader } from '../components/ui'

const CHANNEL_LABELS: Record<Channel, string> = { email: 'Email', sms: 'SMS', push: 'Push' }

export function TemplateNew(_props: { path?: string }) {
  const { selectedProject } = useStore()
  const [categories, setCategories] = useState<string[]>([])

  const [category, setCategory] = useState('')
  const [templateKey, setTemplateKey] = useState('')
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState<Record<Channel, boolean>>({
    email: true,
    sms: false,
    push: false,
  })
  const [content, setContent] = useState<Record<Channel, ChannelValues>>({
    email: {},
    sms: {},
    push: {},
  })
  const [activeTab, setActiveTab] = useState<Channel>('email')

  const [topErrors, setTopErrors] = useState<Record<string, string | undefined>>({})
  const [channelErrors, setChannelErrors] = useState<Record<Channel, Record<string, string>>>({
    email: {},
    sms: {},
    push: {},
  })
  const [channelsBanner, setChannelsBanner] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!selectedProject) return
    listCategories(selectedProject._id)
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [selectedProject])

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
    // Force UPPER_SNAKE_CASE while typing: uppercase + strip anything not [A-Z0-9_].
    setTemplateKey(raw.toUpperCase().replace(/[^A-Z0-9_]/g, ''))
  }

  const validate = (): boolean => {
    const te: Record<string, string> = {}
    const ce: Record<Channel, Record<string, string>> = { email: {}, sms: {}, push: {} }
    let banner: string | null = null

    if (!category.trim()) te.category = 'Category is required.'
    else if (category.trim().length > 60) te.category = 'Category must be 60 characters or fewer.'

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
    // Jump to the first channel tab that has an error.
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
    return { category: category.trim(), template_key: templateKey, name: name.trim(), channels }
  }

  const applyServerErrors = (err: ApiError) => {
    const fe = err.details?.fieldErrors ?? {}
    const te: Record<string, string> = {}
    if (fe.category?.[0]) te.category = fe.category[0]
    if (fe.template_key?.[0]) te.template_key = fe.template_key[0]
    if (fe.name?.[0]) te.name = fe.name[0]
    setTopErrors(te)
    // Nested channel issues flatten under the `channels` key.
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
      <a
        class="back-link"
        href="/templates"
        onClick={(e) => {
          e.preventDefault()
          route('/templates')
        }}
      >
        ← Back to templates
      </a>
      <PageHeader
        title="New template"
        subtitle={`Creating in ${selectedProject.name}.`}
      />

      {banner && <div class="banner-error">{banner}</div>}

      <form onSubmit={submit}>
        <div class="card" style={{ marginBottom: 18 }}>
          <div class="field-row">
            <div class="field">
              <label>Category <span class="hint">(1–60 chars)</span></label>
              <input
                type="text"
                list="category-suggestions"
                value={category}
                placeholder="e.g. Signup"
                class={topErrors.category ? 'invalid' : ''}
                onInput={(e) => setCategory((e.target as HTMLInputElement).value)}
              />
              <datalist id="category-suggestions">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {topErrors.category && <div class="field-error">{topErrors.category}</div>}
            </div>

            <div class="field">
              <label>Template key <span class="hint">(UPPER_SNAKE_CASE)</span></label>
              <input
                type="text"
                class={`mono ${topErrors.template_key ? 'invalid' : ''}`}
                value={templateKey}
                placeholder="WELCOME_EMAIL"
                onInput={(e) => onKeyInput((e.target as HTMLInputElement).value)}
              />
              {topErrors.template_key && <div class="field-error">{topErrors.template_key}</div>}
            </div>
          </div>

          <div class="field" style={{ marginBottom: 0 }}>
            <label>Name <span class="hint">(1–120 chars)</span></label>
            <input
              type="text"
              value={name}
              placeholder="Welcome Email"
              class={topErrors.name ? 'invalid' : ''}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
            {topErrors.name && <div class="field-error">{topErrors.name}</div>}
          </div>
        </div>

        <div class="card">
          <label style={{ marginBottom: 12 }}>Channels <span class="hint">(enable at least one)</span></label>
          <div class="var-list" style={{ marginTop: 0, marginBottom: 16 }}>
            {CHANNELS.map((ch) => (
              <label
                key={ch}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 0, fontWeight: 500 }}
              >
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={enabled[ch]}
                  onChange={(e) => {
                    const on = (e.target as HTMLInputElement).checked
                    setEnabled((prev) => ({ ...prev, [ch]: on }))
                    if (on) setActiveTab(ch)
                  }}
                />
                {CHANNEL_LABELS[ch]}
              </label>
            ))}
          </div>

          {channelsBanner && <div class="banner-error">{channelsBanner}</div>}

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
            />
          ) : (
            <div class="subtle" style={{ padding: '8px 0' }}>
              {CHANNEL_LABELS[activeTab]} is disabled. Tick its checkbox above to add content.
            </div>
          )}
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create template'}
          </button>
          <button type="button" class="btn" onClick={() => route('/templates')} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
