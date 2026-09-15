import { MongoClient, type Db, type ObjectId } from 'mongodb'

/**
 * The storefront's own database — separate from Notifyr's. A consuming app owns
 * its data and knows nothing about the communication service's schema.
 */

const uri = process.env.STORE_MONGODB_URI ?? 'mongodb://localhost:27017'
const dbName = process.env.STORE_DB_NAME ?? 'acme_storefront'

const client = new MongoClient(uri)
let db: Db | null = null

export interface ProductDoc {
  _id?: ObjectId
  sku: string
  name: string
  price: number
  active: boolean
}

export interface OrderLine {
  sku: string
  name: string
  qty: number
  price: number
  line_total: number
}

export interface OrderDoc {
  _id?: ObjectId
  order_no: string
  customer: { full_name: string; email: string }
  lines: OrderLine[]
  currency: string
  subtotal: number
  tax: number
  total: number
  status: 'pending_payment' | 'paid' | 'payment_failed'
  payment_ref: string | null
  invoice: { number: string; issued_at: Date } | null
  /** Kept on the order so a failed invoice email can be found and resent. */
  notification: {
    status: 'not_sent' | 'sent' | 'failed'
    message_log_id: string | null
    error: string | null
    at: Date | null
  }
  created_at: Date
  updated_at: Date
}

export interface PaymentDoc {
  _id?: ObjectId
  order_no: string
  amount: number
  currency: string
  method: string
  status: 'success' | 'failed'
  gateway_ref: string
  failure_reason: string | null
  created_at: Date
}

const SEED_PRODUCTS: Omit<ProductDoc, '_id'>[] = [
  { sku: 'ACM-MSE-01', name: 'Wireless Mouse', price: 24.5, active: true },
  { sku: 'ACM-CBL-02', name: 'USB-C Cable (2m)', price: 8.99, active: true },
  { sku: 'ACM-KBD-03', name: 'Mechanical Keyboard', price: 76.5, active: true },
  { sku: 'ACM-HUB-04', name: '7-Port USB Hub', price: 32.0, active: true },
  { sku: 'ACM-STD-05', name: 'Laptop Stand', price: 41.25, active: true },
  { sku: 'ACM-CAM-06', name: '1080p Webcam', price: 58.0, active: true },
]

export async function connectStoreDb(): Promise<Db> {
  if (db) return db
  await client.connect()
  db = client.db(dbName)

  await db.collection<ProductDoc>('products').createIndex({ sku: 1 }, { unique: true })
  await db.collection<OrderDoc>('orders').createIndex({ order_no: 1 }, { unique: true })
  await db.collection<OrderDoc>('orders').createIndex({ created_at: -1 })
  await db.collection<PaymentDoc>('payments').createIndex({ order_no: 1 })
  await db.collection<PaymentDoc>('payments').createIndex({ gateway_ref: 1 }, { unique: true })

  // Catalogue is reference data: upsert so a fresh database is usable at once
  // and an existing one keeps whatever prices it has.
  for (const product of SEED_PRODUCTS) {
    await db
      .collection<ProductDoc>('products')
      .updateOne({ sku: product.sku }, { $setOnInsert: product }, { upsert: true })
  }

  console.log(`Store database "${dbName}" ready`)
  return db
}

export function getStoreDb(): Db {
  if (!db) throw new Error('Store database not connected — call connectStoreDb() first')
  return db
}

/** Atomic sequence, so two checkouts cannot be handed the same number. */
export async function nextSequence(name: string): Promise<number> {
  const result = await getStoreDb()
    .collection<{ _id: string; value: number }>('counters')
    .findOneAndUpdate(
      { _id: name },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: 'after' }
    )
  return result!.value
}
