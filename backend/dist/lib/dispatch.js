import { htmlToPlainText, renderTemplate, wrapEmailHtml } from './template.js';
import { applyDeferredStyles } from './unicodeStyle.js';
import { sendViaProvider } from '../providers/httpProvider.js';
export async function dispatchSend(channel, content, recipient, data) {
    if (channel === 'email') {
        const subject = renderTemplate(content.subject ?? '', data);
        const renderedHtml = renderTemplate(content.html_body ?? '', data, { escapeHtml: true });
        const html = wrapEmailHtml(renderedHtml);
        const result = await sendViaProvider('email', { to: recipient, subject, html });
        return result.providerMessageId;
    }
    // SMS and push carry no markup. Emphasis becomes Unicode styled characters
    // and everything else is flattened; the deferred pass then styles the values
    // that landed where styled {{tokens}} were, so it must run after rendering.
    const toPlain = (source) => applyDeferredStyles(renderTemplate(htmlToPlainText(source, { styleWithUnicode: true }), data));
    if (channel === 'sms') {
        const result = await sendViaProvider('sms', { to: recipient, body: toPlain(content.body ?? '') });
        return result.providerMessageId;
    }
    const result = await sendViaProvider('push', {
        to: recipient,
        title: content.title ? toPlain(content.title) : undefined,
        body: toPlain(content.body ?? ''),
    });
    return result.providerMessageId;
}
