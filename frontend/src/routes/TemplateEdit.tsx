import { useEffect, useMemo, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { ApiError, API_BASE, getTemplate, testSendChannel, updateChannel } from '../api'
import type { Channel, Template } from '../types'
import { ChannelFields, variablesFor, type ChannelValues } from '../components/ChannelFields'
import { TemplatePreview } from '../components/TemplatePreview'
import { ApiBanner, BackLink, Breadcrumbs, CardHead, PageHeader, Toast, useToast } from '../components/ui'
import { enabledChannels, formatDate, returnTarget } from '../util'

const CHANNEL_LABELS: Record<Channel, string> = { email: 'Email', sms: 'SMS', push: 'Push' }

export function TemplateEdit({ templateKey }: { path?: string; templateKey?: string }) {
  const { selectedProject, projectsLoading } = useStore()
  const { user } = useAuth()
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
  const { toast, showToast } = useToast()
  // Preview-only stand-ins for the {{variables}}. Never submitted, never saved.
  // Held per channel: each channel is sent on its own, with its own variables,
  // so email's {{variable_1}} and the SMS's are different things.
  const [sampleValues, setSampleValues] = useState<Partial<Record<Channel, Record<string, string>>>>(
    {}
  )

  const setSample = (ch: Channel) => (name: string, value: string) =>
    setSampleValues((s) => ({ ...s, [ch]: { ...(s[ch] ?? {}), [name]: value } }))

  const [testRecipient, setTestRecipient] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const runTestSend = async () => {
    if (!selectedProject || !template || !activeTab || !testRecipient.trim()) return
    setTestSending(true)
    setTestResult(null)
    try {
      await testSendChannel(
        selectedProject._id,
        template.template_key,
        activeTab,
        testRecipient.trim(),
        sampleValues[activeTab] ?? {}
      )
      setTestResult({ ok: true, message: `Test sent to ${testRecipient.trim()}.` })
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Test send failed.' })
    } finally {
      setTestSending(false)
    }
  }

  const contentFrom = (t: Template): Partial<Record<Channel, ChannelValues>> => {
    const source = t.pending_channels ?? t.channels
    const next: Partial<Record<Channel, ChannelValues>> = {}
    for (const ch of enabledChannels(t.channels)) {
      const c = source[ch] ?? t.channels[ch]!
      next[ch] = { subject: c.subject, html_body: c.html_body, title: c.title, body: c.body }
    }
    return next
  }

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
        setContent(contentFrom(t))
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
  const locked = template?.status === 'rejected'

  const dirtyChannels = channelKeys.filter((ch) => {
    const saved = template && (template.pending_channels?.[ch] ?? template.channels[ch])
    const current = content[ch]
    if (!saved || !current) return false
    return (
      (saved.subject ?? '') !== (current.subject ?? '') ||
      (saved.html_body ?? '') !== (current.html_body ?? '') ||
      (saved.title ?? '') !== (current.title ?? '') ||
      (saved.body ?? '') !== (current.body ?? '')
    )
  })

  if (projectsLoading) {
    return (
      <div>
        <PageHeader title="Template" />
        <div class="card">Loading…</div>
      </div>
    )
  }

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

  const errorsFor = (ch: Channel): Record<string, string> => {
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
    return e
  }

  const bodyFor = (ch: Channel): Record<string, unknown> => {
    const v = content[ch] ?? {}
    const variables = variablesFor(ch, v)
    if (ch === 'email') return { subject: v.subject ?? '', html_body: v.html_body ?? '', variables }
    if (ch === 'sms') return { body: v.body ?? '', variables }
    return { title: v.title ?? '', body: v.body ?? '', variables }
  }

  const save = async () => {
    if (!template || dirtyChannels.length === 0) return
    setBanner(null)

    for (const ch of dirtyChannels) {
      const found = errorsFor(ch)
      if (Object.keys(found).length > 0) {
        setActiveTab(ch)
        setErrors(found)
        return
      }
    }
    setErrors({})

    setSaving(true)
    const pending = [...dirtyChannels]
    let done = 0

    try {
      let latest = template
      for (const ch of pending) {
        latest = await updateChannel(selectedProject._id, template.template_key, ch, bodyFor(ch))
        done += 1
      }
      setTemplate(latest)
      setContent(contentFrom(latest))
      showToast(
        done === 1
          ? `${CHANNEL_LABELS[pending[0]]} content saved`
          : `${done} channels saved`
      )
    } catch (err) {
      const failed = pending[done]
      const unsaved = pending.slice(done)

      if (err instanceof ApiError) {
        if (err.isNetwork) setBanner(`Can't reach the API at ${API_BASE} — is the backend running?`)
        else if (err.status === 400) {
          const fe = err.details?.fieldErrors
          if (fe) {
            const mapped: Record<string, string> = {}
            for (const [k, msgs] of Object.entries(fe)) if (msgs?.[0]) mapped[k] = msgs[0]
            setErrors(mapped)
          }
          setActiveTab(failed)
          setBanner(`${CHANNEL_LABELS[failed]}: ${err.message}`)
        } else setBanner(`${CHANNEL_LABELS[failed]}: ${err.message}`)
      } else setBanner('Something went wrong.')

      if (done > 0 || (err instanceof ApiError && (err.status === 409 || err.status === 403))) {
        try {
          const fresh = await getTemplate(selectedProject._id, template.template_key)
          setTemplate(fresh)
          setContent((prev) => {
            const next = contentFrom(fresh)
            for (const ch of unsaved) if (prev[ch]) next[ch] = prev[ch]
            return next
          })
        } catch {
          /* leave the page as it stands */
        }
      }
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

      {template?.pending_channels && (
        <div class="template-pending-banner" role="status">
          <span class="template-pending-dot" aria-hidden="true" />
          <span class="template-rejected-text">
            You have an edit awaiting approval. The previous version keeps sending until it's approved.
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
              <p class="page-subtitle">
                {dirtyChannels.length === 0
                  ? 'Edit channel content'
                  : `Unsaved changes in ${dirtyChannels.map((ch) => CHANNEL_LABELS[ch]).join(', ')}`}
              </p>
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

            </div>

            <aside class="tpl-preview">
              {activeTab && (
                <TemplatePreview
                  channel={activeTab}
                  values={content[activeTab] ?? {}}
                  sampleValues={sampleValues[activeTab] ?? {}}
                />
              )}

              {activeTab && (
                <div class="card" style={{ marginTop: 16 }}>
                  <CardHead
                    title="Send test"
                    hint="Sends this content for real, right now — to check it before anyone relies on it. Uses the sample values above."
                  />
                  <div class="field" style={{ marginBottom: 0 }}>
                    <div class="ff">
                      <input
                        type="text"
                        id="test-recipient"
                        value={testRecipient}
                        placeholder=" "
                        onInput={(e) => {
                          setTestRecipient((e.target as HTMLInputElement).value)
                          setTestResult(null)
                        }}
                      />
                      <label for="test-recipient">
                        {activeTab === 'email' ? 'Recipient email' : 'Recipient number'}
                      </label>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-sm"
                    style={{ marginTop: 10 }}
                    disabled={testSending || !testRecipient.trim()}
                    onClick={runTestSend}
                  >
                    {testSending ? 'Sending…' : 'Send test'}
                  </button>
                  {testResult && (
                    <div class={testResult.ok ? 'note' : 'banner-error'} style={{ marginTop: 10 }}>
                      {testResult.message}
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>

          {!locked && (
            <div class="form-actions">
              <button
                type="button"
                class="btn btn-primary"
                disabled={saving || dirtyChannels.length === 0}
                onClick={save}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  )
}
