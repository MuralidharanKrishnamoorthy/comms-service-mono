import { renderTemplate } from './template.js'
import { resendEmailProvider } from '../providers/resend.js'
import { stubSmsProvider, stubPushProvider } from '../providers/stub.js'
import type { ChannelContent } from '../models/template.js'
import type { Channel } from '../models/project.js'

/**
 * Renders the given channel content with `data` and hands it to the matching
 * provider. Shared by the send endpoint (first attempt) and the retry sweep
 * (subsequent attempts) so both paths render and send identically.
 *
 * Throws on provider failure — caller decides how to record that.
 */
export async function dispatchSend(
  channel: Channel,
  content: ChannelContent,
  recipient: string,
  data: Record<string, unknown>
): Promise<string> {
  if (channel === 'email') {
    const subject = renderTemplate(content.subject ?? '', data)
    const html = renderTemplate(content.html_body ?? '', data, { escapeHtml: true })
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
