import { useEffect, useMemo, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { ApiError, API_BASE, getTemplate, updateChannel } from '../api'
import type { Channel, Template } from '../types'
import { ChannelFields, variablesFor, type ChannelValues } from '../components/ChannelFields'
import { TemplatePreview } from '../components/TemplatePreview'
import { ApiBanner, BackLink, Breadcrumbs, CardHead, PageHeader } from '../components/ui'
import { enabledChannels, formatDate, returnTarget } from '../util'

const CHANNEL_LABELS: Record<Channel, string> = { email: 'Email', sms: 'SMS', push: 'Push' }

export function TemplateEdit({ templateKey }: { path?: string; templateKey?: string }) {
  const { selectedProject } = useStore()
  const { user } = useAuth()
  // Admins see status in the Templates list, so the detail-page status banners
  // are for the author (Developer/BA/Tester) only.
  const isAdmin = user?.role === 'admin'

  const back = returnTarget(window.location.search, {
    href: '/templates',
    label: 'Back to templates',
  })
  const [template, setTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<'network' | 'notfound' | null>(null)

  const [content, setContent] = useState<Partial<Record<Channel, ChannelValues>>>({})
  const [activeTab, setActiveTab] = useState<Channel | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  // Preview-only stand-ins for the {{variables}}. Never submitted, never saved.
  // Held per channel: each channel is sent on its own, with its own variables,
  // so email's {{variable_1}} and the SMS's are different things.
  const [sampleValues, setSampleValues] = useState<Partial<Record<Channel, Record<string, string>>>>(
    {}
  )

  const setSample = (ch: Channel) => (name: string, value: string) =>
    setSampleValues((s) => ({ ...s, [ch]: { ...(s[ch] ?? {}), [name]: value } }))

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
        for (const ch of enabledChannels(t.channels)) {
          const c = t.channels[ch]!
          initial[ch] = { subject: c.subject, html_body: c.html_body, title: c.title, body: c.body }
        }
        setContent(initial)
        const first = enabledChannels(t.channels)[0] ?? null
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

  const channelKeys = useMemo(() => (template ? enabledChannels(template.channels) : []), [template])

  // A rejected template is a dead end: the backend refuses any content edit
  // (409), so the editor and Save are locked here to match. "returned" stays
  // fully editable — saving it resubmits for approval.
  const locked = template?.status === 'rejected'

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
        else if (err.status === 409 || err.status === 403) {
          // The template was locked (e.g. rejected) between load and save. Trust
          // the backend, show its message, and re-lock the UI by re-fetching.
          setBanner(err.message)
          getTemplate(selectedProject._id, template.template_key)
            .then((t) => setTemplate(t))
            .catch(() => {})
        } else if (err.status === 400) {
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
      {!isAdmin && template?.status === 'rejected' && (
        <div class="template-rejected-banner" role="alert">
          <span class="template-rejected-dot" aria-hidden="true" />
          <span class="template-rejected-text">
            Rejected by admin.{' '}
            {template.rejection_reason
              ? `Reason: ${template.rejection_reason}.`
              : 'No reason provided.'}{' '}
            This template is locked and can't be edited.
          </span>
        </div>
      )}

      {!isAdmin && template?.status === 'returned' && (
        <div class="template-returned-banner" role="alert">
          <span class="template-returned-dot" aria-hidden="true" />
          <span class="template-rejected-text">
            Returned for edits by admin.{' '}
            {template.remarks ? `Remarks: ${template.remarks}.` : 'No remarks provided.'}{' '}
            Edit below and resubmit for approval.
          </span>
        </div>
      )}

      {!isAdmin && template?.status === 'pending' && (
        <div class="template-pending-banner" role="status">
          <span class="template-pending-dot" aria-hidden="true" />
          <span class="template-rejected-text">
            Pending approval — waiting for an admin to review your changes.
          </span>
        </div>
      )}

      <BackLink href={back.href} label={back.label} onClick={() => route(back.href)} />

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
          <Breadcrumbs trail={['Templates', selectedProject.name]} current={template.name} />

          <div class="page-head">
            <div>
              <h1 class="page-title page-title-row">
                {template.name}
                <span class="chip">{template.template_key}</span>
              </h1>
              <p class="page-subtitle">Edit channel content</p>
            </div>
          </div>

          <div class="tpl-grid">
            <div class="tpl-form">
              <div class="card">
                <CardHead
                  title="Identity"
                  hint="Key and name can't be changed — no endpoint renames a template. Only channel content is editable."
                />
                <dl class="dl">
                  <dt>Template key</dt>
                  <dd>
                    <div class="readonly-value mono">{template.template_key}</div>
                  </dd>
                  <dt>Name</dt>
                  <dd>
                    <div class="readonly-value">{template.name}</div>
                  </dd>
                </dl>
              </div>

              <div class="card">
                <CardHead
                  title="Content"
                  required
                  hint={`Each channel saves on its own. Last updated ${formatDate(template.updated_at)}.`}
                />

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

                {locked && (
                  <div class="tpl-locked-note">
                    🔒 Editing is disabled for rejected templates.
                  </div>
                )}

                {activeTab && template.channels[activeTab] && (
                  <div
                    class={locked ? 'tpl-locked-fields' : undefined}
                    aria-disabled={locked ? 'true' : undefined}
                  >
                    <ChannelFields
                      channel={activeTab}
                      values={content[activeTab] ?? {}}
                      errors={errors}
                      onChange={(p) => patch(activeTab, p)}
                      sampleValues={sampleValues[activeTab] ?? {}}
                      onSampleChange={setSample(activeTab)}
                    />
                  </div>
                )}
              </div>

              {!locked && activeTab && template.channels[activeTab] && (
                <div class="form-actions" style={{ marginTop: 0 }}>
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
              )}
            </div>

            <aside class="tpl-preview">
              {activeTab && (
                <TemplatePreview
                  channel={activeTab}
                  values={content[activeTab] ?? {}}
                  sampleValues={sampleValues[activeTab] ?? {}}
                />
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
