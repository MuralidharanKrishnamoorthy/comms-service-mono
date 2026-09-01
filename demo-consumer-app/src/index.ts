import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.join(__dirname, '..', 'data.json')

const COMMS_BASE_URL = process.env.COMMS_BASE_URL
const COMMS_API_KEY = process.env.COMMS_API_KEY

if (!COMMS_BASE_URL) throw new Error('COMMS_BASE_URL is not set in .env')
if (!COMMS_API_KEY) throw new Error('COMMS_API_KEY is not set in .env')

// Realistic shape: nested customer/order objects, an items array, mixed
// number/string types — the kind of record a real e-commerce DB actually
// returns, not a pre-flattened one built for this demo.
interface OrderItem {
  name: string
  qty: number
  price: number
}

interface OrderRecord {
  id: number
  customer: {
    full_name: string
    email: string
  }
  order: {
    order_id: string
    currency: string
    items: OrderItem[]
    total: number
  }
  placed_at: string
}

async function loadOrders(): Promise<OrderRecord[]> {
  const raw = await readFile(DATA_PATH, 'utf-8')
  return JSON.parse(raw)
}

// This is the part a real consuming app's backend always has to do: pull the
// exact primitive values a template needs out of its own richer internal
// data shape, and compute any derived text itself — the Communication
// Service only ever receives flat, already-decided strings/numbers, never
// nested objects or arrays.
function buildTemplateData(order: OrderRecord) {
  const itemsSummary =
    order.order.items.length > 0
      ? order.order.items.map((item) => `${item.qty}x ${item.name}`).join(', ')
      : 'No items'

  return {
    user_name: order.customer.full_name,
    order_id: order.order.order_id,
    amount: `${order.order.total.toFixed(2)} ${order.order.currency}`,
    items_summary: itemsSummary,
  }
}

const app = new Hono()

app.get('/', (c) => c.text('Demo Consumer App — POST /trigger-send/:id to fire a real notification'))

app.post('/trigger-send/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const orders = await loadOrders()
  const order = orders.find((o) => o.id === id)

  if (!order) {
    return c.json({ error: `No order with id ${id} in data.json` }, 404)
  }

  const payload = {
    template_key: 'ORDER_CREATED',
    channel: 'email',
    recipient: order.customer.email,
    data: buildTemplateData(order),
  }

  const res = await fetch(`${COMMS_BASE_URL}/v1/notifications/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${COMMS_API_KEY}`,
    },
    body: JSON.stringify(payload),
  })

  const result = await res.json()

  return c.json(
    {
      source_order: order,
      request_sent: payload,
      comms_service_response: result,
    },
    res.status as 200 | 400 | 401 | 403 | 404 | 422 | 502
  )
})

const PORT = Number(process.env.PORT ?? 4321)

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Demo consumer app running on http://localhost:${info.port}`)
})
