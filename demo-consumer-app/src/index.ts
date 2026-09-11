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
  invoiceVariables,
  listOrders,
  listProducts,
  markPaid,
  markPaymentFailed,
  recordNotification,
  recordPayment,
} from './store.js'

/**
 * A storefront that owns no notification code: no provider SDK, no email
 * template, no retry loop, no delivery tracking. It has its own database and
 * its own payment flow, and when a payment settles it makes one HTTP call.
 */

const app = new Hono()

app.get('/', (c) => c.html(page()))
app.get('/api/config', (c) => c.json({ store_name: STORE_NAME, ...config() }))
app.get('/api/products', async (c) => c.json(await listProducts()))
app.get('/api/orders', async (c) => c.json(await listOrders()))

app.get('/api/orders/:orderNo', async (c) => {
  const order = await findOrder(c.req.param('orderNo'))
  if (!order) return c.json({ error: 'No such order' }, 404)
  return c.json(order)
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

/**
 * Pay for an order, then invoice it.
 *
 * The ordering is the whole point: the payment is written and the order is
 * moved to `paid` before anything is sent. Mailing an invoice for a payment
 * that had not yet been committed would be a receipt for money the store might
 * not have.
 */
app.post('/api/orders/:orderNo/pay', async (c) => {
  const orderNo = c.req.param('orderNo')
  const body = await c.req.json().catch(() => null)
  const method: PaymentMethod =
    body?.method === 'upi' || body?.method === 'netbanking' ? body.method : 'card'

  const order = await findOrder(orderNo)
  if (!order) return c.json({ error: 'No such order' }, 404)
  if (order.status === 'paid') {
    return c.json({ error: `${orderNo} is already paid`, order }, 409)
  }
  if (order.status === 'payment_failed') {
    return c.json({ error: `${orderNo} previously failed — start a new order`, order }, 409)
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
    return c.json(
      { paid: false, payment: result, order: await findOrder(order.order_no) },
      402
    )
  }

  // Only a transition from pending_payment to paid returns a document. Two
  // callbacks racing for one order means one of them gets null here, which is
  // what stops a customer receiving two invoices for one payment.
  const paid = await markPaid(order.order_no, result.gateway_ref)
  if (!paid) {
    return c.json({ error: `${orderNo} was already settled`, order: await findOrder(orderNo) }, 409)
  }

  const notifyr = await sendNotification({
    template_key: 'INVOICE_PAID',
    channel: 'email',
    recipient: paid.customer.email,
    data: invoiceVariables(paid),
  })

  const outcome: OrderDoc['notification'] = notifyr.ok
    ? {
        status: 'sent',
        message_log_id: String((notifyr.body as { message_log_id?: string })?.message_log_id ?? ''),
        error: null,
        at: new Date(),
      }
    : {
        status: 'failed',
        message_log_id: null,
        error: String((notifyr.body as { error?: string })?.error ?? `HTTP ${notifyr.status}`),
        at: new Date(),
      }

  await recordNotification(paid.order_no, outcome)
  console.log(
    `[notifyr] INVOICE_PAID for ${paid.order_no} — ${notifyr.ok ? 'accepted' : `refused (${notifyr.status || 'unreachable'})`}`
  )

  // The payment stands whether or not the invoice email went out. Failing the
  // request now would tell the customer their payment failed, which is false.
  return c.json({
    paid: true,
    payment: result,
    order: { ...paid, notification: outcome },
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
    console.log(`  Notifyr: ${cfg.baseUrl}  key: ${cfg.keyPrefix}`)
    if (!cfg.configured) {
      console.warn('  No credentials yet — set COMMS_BASE_URL and COMMS_API_KEY in .env')
    }
  })
}

main().catch((err) => {
  console.error('Failed to start the storefront:', err)
  process.exit(1)
})
