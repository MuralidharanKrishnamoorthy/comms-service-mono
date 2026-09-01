import { Hono } from 'hono'
import { getDb } from '../db.js'
import type { MessageLog } from '../models/messageLog.js'

export const webhooksRoute = new Hono()

/**
 * Updates the matching message_logs row by provider_message_id. Generic on
 * purpose — the DB-update logic is shared, but each real provider has its
 * own payload shape and its own signature scheme for verifying the request
 * actually came from them (Twilio: HMAC-SHA1 with the auth token; SendGrid:
 * ECDSA with a published public key; FCM: none needed, it's server-to-server
 * via the Admin SDK). That verification step is the only part each route
 * below still needs once its real provider is wired in — TODO markers show
 * exactly where.
 */
async function updateLogStatus(providerMessageId: string, status: 'delivered' | 'failed', raw: unknown) {
  const db = getDb()
  const result = await db.collection<MessageLog>('message_logs').updateOne(
    { provider_message_id: providerMessageId },
    { $set: { status, provider_response: raw, updated_at: new Date() } }
  )
  return result.matchedCount > 0
}

webhooksRoute.post('/twilio', async (c) => {
  // TODO: verify X-Twilio-Signature (HMAC-SHA1 with the account auth token)
  // against the raw request body before trusting this payload.
  const body = await c.req.json().catch(() => null)
  if (!body?.provider_message_id || !body?.status) {
    return c.json({ error: 'Expected { provider_message_id, status }' }, 400)
  }
  const status = body.status === 'delivered' ? 'delivered' : 'failed'
  const found = await updateLogStatus(body.provider_message_id, status, body)
  if (!found) return c.json({ error: 'No matching message log found' }, 404)
  return c.json({ ok: true })
})

webhooksRoute.post('/sendgrid', async (c) => {
  // TODO: verify the ECDSA signature headers against SendGrid's published
  // public key before trusting this payload.
  const body = await c.req.json().catch(() => null)
  if (!body?.provider_message_id || !body?.status) {
    return c.json({ error: 'Expected { provider_message_id, status }' }, 400)
  }
  const status = body.status === 'delivered' ? 'delivered' : 'failed'
  const found = await updateLogStatus(body.provider_message_id, status, body)
  if (!found) return c.json({ error: 'No matching message log found' }, 404)
  return c.json({ ok: true })
})

webhooksRoute.post('/fcm', async (c) => {
  // FCM delivery results normally come back synchronously from the send call
  // itself rather than a separate webhook — this route exists for symmetry
  // and for any future async delivery-receipt mechanism.
  const body = await c.req.json().catch(() => null)
  if (!body?.provider_message_id || !body?.status) {
    return c.json({ error: 'Expected { provider_message_id, status }' }, 400)
  }
  const status = body.status === 'delivered' ? 'delivered' : 'failed'
  const found = await updateLogStatus(body.provider_message_id, status, body)
  if (!found) return c.json({ error: 'No matching message log found' }, 404)
  return c.json({ ok: true })
})
