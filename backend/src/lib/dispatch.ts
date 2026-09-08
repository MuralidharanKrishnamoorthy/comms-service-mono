import { renderTemplate, wrapEmailHtml } from './template.js'
import { resendEmailProvider } from '../providers/resend.js'
import { stubSmsProvider, stubPushProvider } from '../providers/stub.js'
import type { ChannelContent } from '../models/template.js'
import type { Channel } from '../models/project.js'

export async function dispatchSend(
  channel: Channel,
  content: ChannelContent,
  recipient: string,
  data: Record<string, unknown>
): Promise<string> {
  if (channel === 'email') {
    const subject = renderTemplate(content.subject ?? '', data)
    const renderedHtml = renderTemplate(content.html_body ?? '', data, { escapeHtml: true })
    const html = wrapEmailHtml(renderedHtml)
    const result = await resendEmailProvider.send({ to: recipient, subject, html })
    return result.providerMessageId
  }

  if (channel === 'sms') {
    const body = renderTemplate(content.body ?? '', data)
    const result = await stubSmsProvider.send({ to: recipient, body })
    return result.providerMessageId
  }

  const title = content.title ? renderTemplate(content.title, data) : undefined
  const body = renderTemplate(content.body ?? '', data)
  const result = await stubPushProvider.send({ to: recipient, title, body })
  return result.providerMessageId
}
