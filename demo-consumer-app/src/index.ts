import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { page } from './page.js'
import { config, sendNotification, type Channel } from './notifyr.js'
import {
  CheckoutError,
  STORE_NAME,
  getOrder,
  listOrders,
  markShipped,
  orderConfirmedVariables,
  orderShippedSmsVariables,
  orderShippedVariables,
  placeOrder,
} from './store.js'

/**
 * A pretend storefront that owns no notification code.
 *
 * Placing an order writes the order to the store's own records and then makes
 * one HTTP call to Notifyr. There is no provider SDK here, no email template,
 * no retry loop and no delivery tracking — those belong to the service, and
 * that division is the whole point of the demo.
 */

const app = new Hono()

app.get('/', (c) => c.html(page()))

app.get('/api/config', (c) => c.json({ store_name: STORE_NAME, ...config() }))

app.get('/api/orders', (c) => c.json(listOrders()))

app.post('/api/checkout', async (c) => {
  const body = await c.req.json().catch(() => null)

  let order
  try {
    order = placeOrder({
      full_name: String(body?.full_name ?? ''),
      email: String(body?.email ?? ''),
      lines: Array.isArray(body?.lines) ? body.lines : [],
    })
  } catch (err) {
    if (err instanceof CheckoutError) return c.json({ error: err.message }, 400)
    throw err
  }

  const notifyr = await sendNotification({
    template_key: 'ORDER_CONFIRMED',
    channel: 'email',
    recipient: order.customer.email,
    data: orderConfirmedVariables(order),
  })

  // The order stands whether or not the email went out. A storefront that
  // rolled back a paid order because a notification failed would be worse than
  // one that sends the mail late — and Notifyr retries on its own anyway.
  logOutcome('ORDER_CONFIRMED', order.order_id, notifyr.status)

  return c.json({ order, notifyr, orders: listOrders() })
})

app.post('/api/orders/:orderId/ship', async (c) => {
  const orderId = c.req.param('orderId')
  const body = await c.req.json().catch(() => null)
  const channel: Channel = body?.channel === 'sms' ? 'sms' : 'email'

  if (!getOrder(orderId)) return c.json({ error: `No such order: ${orderId}` }, 404)

  let order
  try {
    order = markShipped(orderId)
  } catch (err) {
    if (err instanceof CheckoutError) return c.json({ error: err.message }, 409)
    throw err
  }

  // Same template, two channels, two different variable lists — the template
  // decides what it needs and the app supplies exactly that.
  const notifyr = await sendNotification({
    template_key: 'ORDER_SHIPPED',
    channel,
    recipient: channel === 'sms' ? '+919000000000' : order.customer.email,
    data: channel === 'sms' ? orderShippedSmsVariables(order) : orderShippedVariables(order),
  })

  logOutcome('ORDER_SHIPPED', order.order_id, notifyr.status)

  return c.json({ order, notifyr, orders: listOrders() })
})

function logOutcome(templateKey: string, orderId: string, status: number) {
  const verdict = status === 201 || status === 200 ? 'accepted' : `refused (${status || 'unreachable'})`
  console.log(`[notifyr] ${templateKey} for ${orderId} — ${verdict}`)
}

const PORT = Number(process.env.PORT ?? 4321)

serve({ fetch: app.fetch, port: PORT }, (info) => {
  const cfg = config()
  console.log(`${STORE_NAME} running on http://localhost:${info.port}`)
  console.log(`  Notifyr: ${cfg.baseUrl}  key: ${cfg.keyPrefix}`)
  if (!cfg.configured) {
    console.warn('  No credentials yet — set COMMS_BASE_URL and COMMS_API_KEY in .env')
  }
})
