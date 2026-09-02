import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateVariables, MissingVariablesError } from '../lib/template.js';
import { createMessageLog, markSent, markFailedAndScheduleRetry } from '../lib/messageLog.js';
import { dispatchSend } from '../lib/dispatch.js';
const sendSchema = z.object({
    template_key: z.string().min(1),
    channel: z.enum(['email', 'sms', 'push']),
    recipient: z.string().min(1),
    data: z.record(z.string(), z.unknown()).default({}),
});
export const sendRoute = new Hono();
sendRoute.use(authMiddleware);
sendRoute.post('/', async (c) => {
    const project = c.get('project');
    const body = await c.req.json().catch(() => null);
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
    }
    const { template_key, channel, recipient, data } = parsed.data;
    if (!project.channels_allowed.includes(channel)) {
        return c.json({ error: `Project is not permitted to use channel "${channel}"` }, 403);
    }
    const db = getDb();
    const template = await db.collection('templates').findOne({
        project_id: project._id,
        template_key,
    });
    if (!template) {
        return c.json({ error: `Template "${template_key}" not found` }, 404);
    }
    const channelContent = template.channels[channel];
    if (!channelContent) {
        return c.json({ error: `Template "${template_key}" has no "${channel}" content configured` }, 400);
    }
    if (!channelContent.live) {
        return c.json({ error: `Template "${template_key}" "${channel}" channel is not live` }, 400);
    }
    try {
        validateVariables(channelContent.variables, data);
    }
    catch (err) {
        if (err instanceof MissingVariablesError) {
            return c.json({ error: err.message, missing: err.missing }, 422);
        }
        throw err;
    }
    const log = await createMessageLog({
        project_id: project._id,
        template_id: template._id,
        template_key: template.template_key,
        channel,
        recipient,
        data,
    });
    try {
        const providerMessageId = await dispatchSend(channel, channelContent, recipient, data);
        await markSent(log.id, providerMessageId);
        return c.json({ message_log_id: log.id, status: 'sent', provider_message_id: providerMessageId });
    }
    catch (err) {
        console.error('Send failed:', err);
        await markFailedAndScheduleRetry(log.id, log.attempts);
        return c.json({ error: 'Failed to send, will retry automatically', message_log_id: log.id }, 502);
    }
});
