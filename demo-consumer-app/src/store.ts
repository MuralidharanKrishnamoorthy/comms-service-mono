import {
  getStoreDb,
  nextSequence,
  type OrderDoc,
  type OrderLine,
  type PaymentDoc,
  type ProductDoc,
} from './db.js'

/**
 * The storefront's own domain: catalogue, orders, payments. Everything here is
 * ordinary application code that would exist whether or not Notifyr did.
 */

export const STORE_NAME = process.env.STORE_NAME ?? 'Acme Storefront'
const CURRENCY = 'USD'
const TAX_RATE = 0.08

export class StoreError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export function listProducts(): Promise<ProductDoc[]> {
  return getStoreDb()
    .collection<ProductDoc>('products')
    .find({ active: true }, { projection: { _id: 0 } })
    .sort({ name: 1 })
    .toArray()
}

export function listOrders(limit = 12): Promise<OrderDoc[]> {
  return getStoreDb()
    .collection<OrderDoc>('orders')
    .find({}, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray()
}

export function findOrder(orderNo: string): Promise<OrderDoc | null> {
  return getStoreDb()
    .collection<OrderDoc>('orders')
    .findOne({ order_no: orderNo }, { projection: { _id: 0 } })
}

export interface CartLine {
  sku: string
  qty: number
}

function money(value: number): number {
  return Number(value.toFixed(2))
}

/**
 * Creates an order in `pending_payment`. Prices are read from the catalogue
 * here and frozen onto the order, never taken from the request — a client that
 * posts its own prices is a client that decides what it pays.
 */
export async function createOrder(input: {
  full_name: string
  email: string
  lines: CartLine[]
}): Promise<OrderDoc> {
  const name = input.full_name.trim()
  const email = input.email.trim().toLowerCase()
  if (!name) throw new StoreError('A customer name is required')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new StoreError('A valid customer email is required')
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new StoreError('The cart is empty')
  if (input.lines.length > 20) throw new StoreError('Too many different items in one order')

  const db = getStoreDb()
  const lines: OrderLine[] = []

  for (const line of input.lines) {
    const product = await db.collection<ProductDoc>('products').findOne({ sku: line.sku, active: true })
    if (!product) throw new StoreError(`No such product: ${line.sku}`, 404)

    const qty = Math.trunc(Number(line.qty))
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
      throw new StoreError(`Bad quantity for ${product.name}`)
    }
    lines.push({
      sku: product.sku,
      name: product.name,
      qty,
      price: product.price,
      line_total: money(product.price * qty),
    })
  }

  const subtotal = money(lines.reduce((sum, l) => sum + l.line_total, 0))
  const tax = money(subtotal * TAX_RATE)
  const now = new Date()

  const order: OrderDoc = {
    order_no: `ORD-${String(await nextSequence('order_no')).padStart(6, '0')}`,
    customer: { full_name: name, email },
    lines,
    currency: CURRENCY,
    subtotal,
    tax,
    total: money(subtotal + tax),
    status: 'pending_payment',
    payment_ref: null,
    invoice: null,
    notification: { status: 'not_sent', message_log_id: null, error: null, at: null },
    created_at: now,
    updated_at: now,
  }

  await db.collection<OrderDoc>('orders').insertOne(order)
  const { _id, ...clean } = order
  return clean as OrderDoc
}

export async function recordPayment(payment: Omit<PaymentDoc, '_id'>): Promise<void> {
  await getStoreDb().collection<PaymentDoc>('payments').insertOne(payment)
}

/**
 * Moves an order to `paid` and stamps it with an invoice number — but only if
 * it is still `pending_payment`. Two payment callbacks racing for the same
 * order means exactly one of them matches, so exactly one invoice number is
 * issued and exactly one email can follow.
 */
export async function markPaid(orderNo: string, gatewayRef: string): Promise<OrderDoc | null> {
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(
    await nextSequence('invoice_no')
  ).padStart(5, '0')}`

  const result = await getStoreDb()
    .collection<OrderDoc>('orders')
    .findOneAndUpdate(
      { order_no: orderNo, status: 'pending_payment' },
      {
        $set: {
          status: 'paid',
          payment_ref: gatewayRef,
          invoice: { number: invoiceNumber, issued_at: new Date() },
          updated_at: new Date(),
        },
      },
      { returnDocument: 'after', projection: { _id: 0 } }
    )

  return result ?? null
}

export async function markPaymentFailed(orderNo: string): Promise<void> {
  await getStoreDb()
    .collection<OrderDoc>('orders')
    .updateOne(
      { order_no: orderNo, status: 'pending_payment' },
      { $set: { status: 'payment_failed', updated_at: new Date() } }
    )
}

export async function recordNotification(
  orderNo: string,
  outcome: OrderDoc['notification']
): Promise<void> {
  await getStoreDb()
    .collection<OrderDoc>('orders')
    .updateOne({ order_no: orderNo }, { $set: { notification: outcome, updated_at: new Date() } })
}

/**
 * The step every consuming app performs for itself: reduce a rich internal
 * record down to the flat primitives the template declares. Notifyr never sees
 * the order document — only already-formatted strings. Currency symbols,
 * rounding and date formatting are decisions this app makes, not the service.
 */
export function invoiceVariables(order: OrderDoc) {
  const itemsSummary = order.lines.map((l) => `${l.qty}x ${l.name}`).join(', ')
  const amount = (value: number) => `${value.toFixed(2)} ${order.currency}`

  return {
    customer_name: order.customer.full_name,
    invoice_no: order.invoice?.number ?? '',
    order_no: order.order_no,
    items_summary: itemsSummary,
    subtotal: amount(order.subtotal),
    tax: amount(order.tax),
    amount_paid: amount(order.total),
    payment_ref: order.payment_ref ?? '',
    paid_on: (order.invoice?.issued_at ?? new Date()).toUTCString(),
    store_name: STORE_NAME,
  }
}
