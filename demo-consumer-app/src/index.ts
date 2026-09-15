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

/** Point this at your own template in .env; orderVariables() supplies the values. */
const TEMPLATE_KEY = (process.env.NOTIFYR_TEMPLATE_KEY ?? 'INVOICE_PAID').trim().toUpperCase()

const app = new Hono()

app.get('/', (c) => c.html(page()))
app.get('/api/config', (c) => c.json({ store_name: STORE_NAME, ...config() }))
app.get('/api/products', async (c) => c.json(await listProducts()))

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

/**
 * Pay, then invoice. The payment is written and the order moved to `paid`
 * before anything is sent — mailing a receipt for money the store might not
 * have would be worse than mailing late.
 */
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
    return c.json({ paid: false, payment: result, order: await findOrder(order.order_no) }, 402)
  }

  // Only a transition out of pending_payment returns a document, so two
  // callbacks racing for one order can never produce two invoices.
  const paid = await markPaid(order.order_no, result.gateway_ref)
  if (!paid) {
    return c.json({ error: `${orderNo} was already settled`, order: await findOrder(orderNo) }, 409)
  }

  const notifyr = await sendNotification({
    template_key: TEMPLATE_KEY,
    channel: 'email',
    recipient: paid.customer.email,
    data: orderVariables(paid),
  })

  const notification: OrderDoc['notification'] = {
    status: notifyr.ok ? 'sent' : 'failed',
    message_log_id: notifyr.ok
      ? String((notifyr.body as { message_log_id?: string })?.message_log_id ?? '')
      : null,
    error: notifyr.ok
      ? null
      : String((notifyr.body as { error?: string })?.error ?? `HTTP ${notifyr.status}`),
    at: new Date(),
  }
  await recordNotification(paid.order_no, notification)
  console.log(
    `[notifyr] ${TEMPLATE_KEY} for ${paid.order_no} — ` +
      (notifyr.ok ? 'accepted' : `refused (${notifyr.status || 'unreachable'})`)
  )

  // The payment stands whether or not the email went out. Failing now would
  // tell the customer their payment failed, which is false.
  return c.json({
    paid: true,
    payment: result,
    order: { ...paid, notification },
    notifyr: { status: notifyr.status, ok: notifyr.ok },
  })
})

app.onError((err, c) => {
  if (err instanceof StoreError) return c.json({ error: err.message }, err.status as 400)
  console.error('Unhandled error:', err)
  return c.json({ error: 'The storefront hit an unexpected error' }, 500)
})

const PORT = Number(process.env.PORT ?? 4321)

async function main() {
  await connectStoreDb()

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    const cfg = config()
    console.log(`${STORE_NAME} running on http://localhost:${info.port}`)
    console.log(`  Notifyr: ${cfg.baseUrl}  key: ${cfg.keyPrefix}  template: ${TEMPLATE_KEY}`)
    if (!cfg.configured) {
      console.warn('  No credentials — set COMMS_BASE_URL and COMMS_API_KEY in .env')
    }
  })
}

main().catch((err) => {
  console.error('Failed to start the storefront:', err)
  process.exit(1)
})
