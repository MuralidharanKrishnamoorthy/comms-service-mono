import { MongoClient, type Db } from 'mongodb'

const uri = process.env.MONGODB_URI
const dbName = process.env.DB_NAME

if (!uri) {
  throw new Error('MONGODB_URI is not set in backend/.env')
}

if (!dbName) {
  throw new Error('DB_NAME is not set in backend/.env')
}

const client = new MongoClient(uri)

let db: Db | null = null

async function ensureIndexes(database: Db): Promise<void> {
  try {
    await database.collection('projects').dropIndex('api_key_hash_1')
  } catch {
  }

  await database.collection('templates').createIndex({ project_id: 1, template_key: 1 }, { unique: true })
  await database.collection('message_logs').createIndex({ project_id: 1, created_at: -1 })
  await database.collection('message_logs').createIndex({ status: 1, next_retry_at: 1 })
  await database.collection('message_logs').createIndex({ provider_message_id: 1 })
  // Category names used to be unique across the whole database, which let one
  // team's name block another team that could not even see it. Names are now
  // unique per project instead.
  try {
    await database.collection('categories').dropIndex('name_1')
  } catch {
  }

  await database.collection('categories').createIndex({ 'templates.template_id': 1 })
  // One entry per (project, name) pair the category touches. Multikey on
  // templates.project_id only, so it is a legal compound index, and its
  // leading field also serves the visibility filter — no separate index for
  // that. A category spanning two projects reserves its name in both.
  await database
    .collection('categories')
    .createIndex({ 'templates.project_id': 1, name: 1 }, { unique: true })

  await database.collection('users').createIndex({ email: 1 }, { unique: true })
  await database.collection('users').createIndex({ project_ids: 1 })

  await database.collection('api_keys').createIndex({ project_id: 1 })
  await database.collection('api_keys').createIndex({ project_id: 1, created_by: 1 })
  await database.collection('api_keys').createIndex({ key_hash: 1 }, { unique: true })
}

export async function connectDb(): Promise<Db> {
  if (db) return db
  await client.connect()
  db = client.db(dbName)
  await ensureIndexes(db)
  console.log(`Connected to MongoDB database "${dbName}"`)
  return db
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not connected yet — call connectDb() before getDb()')
  }
  return db
}
