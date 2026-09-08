import { Hono } from 'hono';
import { getDb } from '../db.js';
export const webhooksRoute = new Hono();
async function updateLogStatus(providerMessageId, status, raw) {
    const db = getDb();
    const result = await db.collection('message_logs').updateOne({ provider_message_id: providerMessageId }, { $set: { status, provider_response: raw, updated_at: new Date() } });
    return result.matchedCount > 0;
}
webhooksRoute.post('/twilio', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.provider_message_id || !body?.status) {
        return c.json({ error: 'Expected { provider_message_id, status }' }, 400);
    }
    const status = body.status === 'delivered' ? 'delivered' : 'failed';
    const found = await updateLogStatus(body.provider_message_id, status, body);
    if (!found)
        return c.json({ error: 'No matching message log found' }, 404);
    return c.json({ ok: true });
});
webhooksRoute.post('/sendgrid', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.provider_message_id || !body?.status) {
        return c.json({ error: 'Expected { provider_message_id, status }' }, 400);
    }
    const status = body.status === 'delivered' ? 'delivered' : 'failed';
    const found = await updateLogStatus(body.provider_message_id, status, body);
    if (!found)
        return c.json({ error: 'No matching message log found' }, 404);
    return c.json({ ok: true });
});
webhooksRoute.post('/fcm', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.provider_message_id || !body?.status) {
        return c.json({ error: 'Expected { provider_message_id, status }' }, 400);
    }
    const status = body.status === 'delivered' ? 'delivered' : 'failed';
    const found = await updateLogStatus(body.provider_message_id, status, body);
    if (!found)
        return c.json({ error: 'No matching message log found' }, 404);
    return c.json({ ok: true });
});
