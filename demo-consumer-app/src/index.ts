import { randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { page } from './page.js'
import { config, sendNotification } from './notifyr.js'
import { connectStoreDb, type OrderDoc } from './db.js'
import { charge, maskCard, type PaymentMethod } from './payments.js'
import {
  STORE_NAME,
  StoreError,
  createOrder,
  findOrder,
  listProducts,
  markPaid,
  markPaymentFailed,
  orderVariables,
  recordNotification,
  recordPayment,
} from './store.js'

/**
 * A storefront that owns no notification code: no provider SDK, no email
 * template, no retry loop, no delivery tracking. When a payment settles it
 * makes one HTTP call.
 */

const PORT = Number(process.env.PORT ?? 4321)

/** One template per event. Both must be in the same project as COMMS_API_KEY. */
const TEMPLATE_NAME = process.env.TEMPLATE_NAME?.trim() || 'INVOICE_PAID'
const TEMPLATE_INVITE = process.env.TEMPLATE_INVITE?.trim() || 'USER_INVITE'

const app = new Hono()

/** Sends one template and records the outcome on the order. */
async function notify(order: OrderDoc, templateKey: string, extra?: Record<string, string>) {
  const result = await sendNotification({
    template_key: templateKey,
    channel: 'email',
    recipient: order.customer.email,
    data: orderVariables(order, extra),
  })

  const notification: OrderDoc['notification'] = {
    status: result.ok ? 'sent' : 'failed',
    template_key: templateKey,
    message_log_id: result.ok
      ? String((result.body as { message_log_id?: string })?.message_log_id ?? '')
      : null,
    error: result.ok
      ? null
      : String((result.body as { error?: string })?.error ?? `HTTP ${result.status}`),
    at: new Date(),
  }

  await recordNotification(order.order_no, notification)
  console.log(
    `[notifyr] ${templateKey} for ${order.order_no} — ` +
      (result.ok ? 'accepted' : `refused (${result.status || 'unreachable'})`)
  )
  return notification
}

app.get('/', (c) => c.html(page()))
app.get('/api/config', (c) => c.json({ store_name: STORE_NAME, ...config() }))
app.get('/api/products', async (c) => c.json(await listProducts()))

/** A second event, so a second template — and no order, so its own variables. */
app.post('/api/invite', async (c) => {
  const body = await c.req.json().catch(() => null)
  const name = String(body?.name ?? '').trim()
  const email = String(body?.email ?? '').trim().toLowerCase()

  if (!name) return c.json({ error: 'A name is required' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ error: 'A valid email is required' }, 400)
  }

  const inviteUrl = `${process.env.PUBLIC_URL ?? `http://localhost:${PORT}`}/join/${randomUUID().slice(0, 8)}`

  const result = await sendNotification({
    template_key: TEMPLATE_INVITE,
    channel: 'email',
    recipient: email,
    data: {
      name,
      user_name: name,
      customer_name: name,
      email,
      invite_url: inviteUrl,
      role: String(body?.role ?? 'Member'),
      system: STORE_NAME,
      store_name: STORE_NAME,
      company_name: STORE_NAME,
      brand: STORE_NAME,
    },
  })

  console.log(
    `[notifyr] ${TEMPLATE_INVITE} to ${email} — ` +
      (result.ok ? 'accepted' : `refused (${result.status || 'unreachable'})`)
  )

  return c.json({
    sent: result.ok,
    template_key: TEMPLATE_INVITE,
    recipient: email,
    invite_url: inviteUrl,
    status: result.status,
    error: result.ok ? null : String((result.body as { error?: string })?.error ?? `HTTP ${result.status}`),
  })
})

app.post('/api/checkout', async (c) => {
  const body = await c.req.json().catch(() => null)
  const order = await createOrder({
    full_name: String(body?.full_name ?? ''),
    email: String(body?.email ?? ''),
    lines: Array.isArray(body?.lines) ? body.lines : [],
  })
  // Nothing is mailed here. An order nobody has paid for is not news.
  return c.json({ order }, 201)
})

/** Pay, then invoice. Nothing is sent until the payment is committed. */
app.post('/api/orders/:orderNo/pay', async (c) => {
  const orderNo = c.req.param('orderNo')
  const body = await c.req.json().catch(() => null)
  const method: PaymentMethod =
    body?.method === 'upi' || body?.method === 'netbanking' ? body.method : 'card'

  const order = await findOrder(orderNo)
  if (!order) return c.json({ error: 'No such order' }, 404)
  if (order.status !== 'pending_payment') {
    return c.json({ error: `${orderNo} is already ${order.status.replace('_', ' ')}`, order }, 409)
  }

  const result = await charge({
    amount: order.total,
    currency: order.currency,
    method,
    card_number: body?.card_number,
  })

  await recordPayment({
    order_no: order.order_no,
    amount: order.total,
    currency: order.currency,
    method: method === 'card' ? `card ${maskCard(body?.card_number)}` : method,
    status: result.status,
    gateway_ref: result.gateway_ref,
    failure_reason: result.failure_reason,
    created_at: new Date(),
  })

  if (result.status === 'failed') {
    await markPaymentFailed(order.order_no)
    // Nothing is mailed for a payment that did not settle.
    return c.json({ paid: false, payment: result, order: await findOrder(order.order_no) }, 402)
  }

  // Only a transition out of pending_payment returns a document, so two
  // callbacks racing for one order can never produce two invoices.
  const paid = await markPaid(order.order_no, result.gateway_ref)
  if (!paid) {
    return c.json({ error: `${orderNo} was already settled`, order: await findOrder(orderNo) }, 409)
  }

  const notification = await notify(paid, TEMPLATE_NAME)

  return c.json({ paid: true, payment: result, order: { ...paid, notification } })
})

app.onError((err, c) => {
  if (err instanceof StoreError) return c.json({ error: err.message }, err.status as 400)
  console.error('Unhandled error:', err)
  return c.json({ error: 'The storefront hit an unexpected error' }, 500)
})


async function main() {
  await connectStoreDb()

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    const cfg = config()
    console.log(`${STORE_NAME} running on http://localhost:${info.port}`)
    console.log(`  Notifyr: ${cfg.baseUrl}  key: ${cfg.keyPrefix}  templates: ${TEMPLATE_NAME} / ${TEMPLATE_INVITE}`)
    if (!cfg.configured) {
      console.warn('  No credentials — set COMMS_BASE_URL and COMMS_API_KEY in .env')
    }
  })
}

main().catch((err) => {
  console.error('Failed to start the storefront:', err)
  process.exit(1)
})
