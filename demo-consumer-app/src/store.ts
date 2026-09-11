/**
 * The storefront's own world: a product catalogue and the orders placed against
 * it. This is the part a real consuming app already has before Notifyr enters
 * the picture, and it is deliberately shaped like real application data —
 * nested customer and order objects, an items array, numbers as numbers.
 *
 * Orders live in memory. Restarting the app forgets them, which is exactly what
 * a demo wants.
 */

export interface Product {
  sku: string
  name: string
  price: number
}

export interface OrderItem {
  sku: string
  name: string
  qty: number
  price: number
}

export interface Order {
  order_id: string
  customer: {
    full_name: string
    email: string
  }
  items: OrderItem[]
  currency: string
  total: number
  placed_at: string
  shipment?: {
    carrier: string
    tracking_number: string
    shipped_at: string
  }
}

export const STORE_NAME = process.env.STORE_NAME ?? 'Acme Storefront'

export const CATALOGUE: Product[] = [
  { sku: 'ACM-MSE-01', name: 'Wireless Mouse', price: 24.5 },
  { sku: 'ACM-CBL-02', name: 'USB-C Cable (2m)', price: 8.99 },
  { sku: 'ACM-KBD-03', name: 'Mechanical Keyboard', price: 76.5 },
  { sku: 'ACM-HUB-04', name: '7-Port USB Hub', price: 32.0 },
  { sku: 'ACM-STD-05', name: 'Laptop Stand', price: 41.25 },
  { sku: 'ACM-CAM-06', name: '1080p Webcam', price: 58.0 },
]

const orders = new Map<string, Order>()
let sequence = 48213

export function listOrders(): Order[] {
  return [...orders.values()].sort((a, b) => b.placed_at.localeCompare(a.placed_at))
}

export function getOrder(orderId: string): Order | undefined {
  return orders.get(orderId)
}

export interface CartLine {
  sku: string
  qty: number
}

export class CheckoutError extends Error {}

export function placeOrder(input: {
  full_name: string
  email: string
  lines: CartLine[]
}): Order {
  const name = input.full_name.trim()
  const email = input.email.trim()
  if (!name) throw new CheckoutError('A customer name is required')
  if (!email.includes('@')) throw new CheckoutError('A valid customer email is required')
  if (input.lines.length === 0) throw new CheckoutError('The cart is empty')

  const items: OrderItem[] = input.lines.map((line) => {
    const product = CATALOGUE.find((p) => p.sku === line.sku)
    if (!product) throw new CheckoutError(`No such product: ${line.sku}`)
    const qty = Math.trunc(line.qty)
    if (qty < 1 || qty > 99) throw new CheckoutError(`Bad quantity for ${product.name}`)
    return { sku: product.sku, name: product.name, qty, price: product.price }
  })

  sequence += 1
  const order: Order = {
    order_id: `ORD-${sequence}`,
    customer: { full_name: name, email },
    items,
    currency: 'USD',
    total: Number(items.reduce((sum, i) => sum + i.price * i.qty, 0).toFixed(2)),
    placed_at: new Date().toISOString(),
  }
  orders.set(order.order_id, order)
  return order
}

const CARRIERS = ['BlueDart', 'DHL Express', 'FedEx']

export function markShipped(orderId: string): Order {
  const order = orders.get(orderId)
  if (!order) throw new CheckoutError(`No such order: ${orderId}`)
  if (order.shipment) throw new CheckoutError(`${orderId} has already shipped`)

  order.shipment = {
    carrier: CARRIERS[Math.floor(Math.random() * CARRIERS.length)],
    tracking_number: `TRK${Math.floor(Math.random() * 900_000_000 + 100_000_000)}`,
    shipped_at: new Date().toISOString(),
  }
  return order
}

/**
 * The step every consuming app has to perform for itself: reduce its own rich
 * internal record down to the flat primitives one template declares. Notifyr
 * never receives the nested order — only already-decided strings and numbers.
 *
 * Keep the keys here identical to the variables the template declares, or the
 * send comes back 422 naming exactly what is missing.
 */
export function orderConfirmedVariables(order: Order) {
  const deliveryDate = new Date(Date.parse(order.placed_at) + 4 * 24 * 60 * 60 * 1000)
  return {
    customer_name: order.customer.full_name,
    order_id: order.order_id,
    order_total: `${order.total.toFixed(2)} ${order.currency}`,
    delivery_date: deliveryDate.toDateString(),
    order_url: `${publicUrl()}/orders/${order.order_id}`,
    store_name: STORE_NAME,
  }
}

export function orderShippedVariables(order: Order) {
  if (!order.shipment) throw new CheckoutError(`${order.order_id} has not shipped yet`)
  return {
    customer_name: order.customer.full_name,
    order_id: order.order_id,
    carrier: order.shipment.carrier,
    tracking_number: order.shipment.tracking_number,
    tracking_url: `https://track.example.com/${order.shipment.tracking_number}`,
    store_name: STORE_NAME,
  }
}

/** SMS has its own, shorter variable list — the same order, fewer fields. */
export function orderShippedSmsVariables(order: Order) {
  const full = orderShippedVariables(order)
  return {
    store_name: full.store_name,
    order_id: full.order_id,
    tracking_url: full.tracking_url,
  }
}

function publicUrl(): string {
  return process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4321}`
}
