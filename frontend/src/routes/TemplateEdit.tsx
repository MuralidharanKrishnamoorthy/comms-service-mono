import { useEffect, useMemo, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { ApiError, API_BASE, getTemplate, updateChannel } from '../api'
import type { Channel, Template } from '../types'
import { ChannelFields, variablesFor, type ChannelValues } from '../components/ChannelFields'
import { ApiBanner, BackLink, PageHeader } from '../components/ui'
import { formatDate } from '../util'

const CHANNEL_LABELS: Record<Channel, string> = { email: 'Email', sms: 'SMS', push: 'Push' }

export function TemplateEdit({ templateKey }: { path?: string; templateKey?: string }) {
  const { selectedProject } = useStore()
  const [template, setTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<'network' | 'notfound' | null>(null)

  const [content, setContent] = useState<Partial<Record<Channel, ChannelValues>>>({})
  const [activeTab, setActiveTab] = useState<Channel | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    if (!selectedProject || !templateKey) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getTemplate(selectedProject._id, templateKey)
      .then((t) => {
        if (cancelled) return
        setTemplate(t)
        const initial: Partial<Record<Channel, ChannelValues>> = {}
        for (const ch of Object.keys(t.channels) as Channel[]) {
          const c = t.channels[ch]
          if (!c) continue
          initial[ch] = { subject: c.subject, html_body: c.html_body, title: c.title, body: c.body }
        }
        setContent(initial)
        const first = (Object.keys(t.channels) as Channel[])[0] ?? null
        setActiveTab(first)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.isNetwork) setLoadError('network')
        else setLoadError('notfound')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedProject, templateKey])

  const channelKeys = useMemo(
    () => (template ? (Object.keys(template.channels) as Channel[]) : []),
    [template]
  )

  if (!selectedProject) {
    return (
      <div>
        <PageHeader title="Template" />
        <div class="empty">Select a project in the top bar first.</div>
      </div>
    )
  }

  const patch = (ch: Channel, p: ChannelValues) =>
    setContent((c) => ({ ...c, [ch]: { ...c[ch], ...p } }))

  const validateChannel = (ch: Channel): boolean => {
    const v = content[ch] ?? {}
    const e: Record<string, string> = {}
    if (ch === 'email') {
      if (!v.subject?.trim()) e.subject = 'Subject is required for email.'
      if (!v.html_body?.trim()) e.html_body = 'HTML body is required for email.'
    } else if (ch === 'sms') {
      if (!v.body?.trim()) e.body = 'Message body is required for SMS.'
    } else {
      if (!v.body?.trim()) e.body = 'Body is required for push.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const save = async (ch: Channel) => {
    if (!template) return
    setBanner(null)
    setSavedFlash(false)
    if (!validateChannel(ch)) return
    const v = content[ch] ?? {}
    const variables = variablesFor(ch, v)
    let body: Record<string, unknown>
    if (ch === 'email') body = { subject: v.subject ?? '', html_body: v.html_body ?? '', variables }
    else if (ch === 'sms') body = { body: v.body ?? '', variables }
    else body = { title: v.title ?? '', body: v.body ?? '', variables }

    setSaving(true)
    try {
      const updated = await updateChannel(selectedProject._id, template.template_key, ch, body)
      setTemplate(updated)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isNetwork) setBanner(`Can't reach the API at ${API_BASE} — is the backend running?`)
        else if (err.status === 400) {
          const fe = err.details?.fieldErrors
          if (fe) {
            const mapped: Record<string, string> = {}
            for (const [k, msgs] of Object.entries(fe)) if (msgs?.[0]) mapped[k] = msgs[0]
            setErrors(mapped)
          }
          setBanner(err.message)
        } else setBanner(err.message)
      } else setBanner('Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <BackLink href="/templates" label="Back to templates" onClick={() => route('/templates')} />

      {loadError === 'network' && <ApiBanner base={API_BASE} />}

      {loading ? (
        <div class="card">Loading…</div>
      ) : loadError === 'notfound' || !template ? (
        <div class="card">
          <p style={{ margin: 0 }}>
            Template <span class="mono">{templateKey}</span> not found in{' '}
            {selectedProject.name}.
          </p>
        </div>
      ) : (
        <>
          <PageHeader title={template.name} subtitle="Edit channel content" />

          <div class="card" style={{ marginBottom: 18 }}>
            <dl class="dl">
              <dt>Category</dt>
              <dd>
                <div class="readonly-value">{template.category}</div>
              </dd>
              <dt>Template key</dt>
              <dd>
                <div class="readonly-value mono">{template.template_key}</div>
              </dd>
              <dt>Name</dt>
              <dd>
                <div class="readonly-value">{template.name}</div>
              </dd>
            </dl>
            <p class="subtle" style={{ margin: '12px 0 0' }}>
              Category, key and name can't be changed — no endpoint renames or
              recategorizes a template. Only channel content is editable.
            </p>
          </div>

          <div class="card">
            <div class="tabs">
              {channelKeys.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  class={`tab ${activeTab === ch ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab(ch)
                    setErrors({})
                    setBanner(null)
                    setSavedFlash(false)
                  }}
                >
                  {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>

            {banner && <div class="banner-error">{banner}</div>}

            {activeTab && template.channels[activeTab] && (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <span class="version-badge">
                    v{template.channels[activeTab]!.version}
                  </span>
                  <span class={`badge ${template.channels[activeTab]!.live ? 'badge-success' : 'badge-neutral'}`}>
                    {template.channels[activeTab]!.live ? 'live' : 'not live'}
                  </span>
                  <span class="cell-faint">Updated {formatDate(template.updated_at)}</span>
                </div>

                <ChannelFields
                  channel={activeTab}
                  values={content[activeTab] ?? {}}
                  errors={errors}
                  onChange={(p) => patch(activeTab, p)}
                />

                <div class="form-actions">
                  <button
                    type="button"
                    class="btn btn-primary"
                    disabled={saving}
                    onClick={() => save(activeTab)}
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  {savedFlash && (
                    <span class="copied-flash">
                      ✓ Saved — now v{template.channels[activeTab]!.version}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
