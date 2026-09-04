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
  // The legacy unique index on projects.api_key_hash is gone — keys now live in
  // the api_keys collection. Drop it if present: once the field is unset on
  // migrated projects, a unique index would treat every missing value as null
  // and collide. Ignore the error when it doesn't exist.
  try {
    await database.collection('projects').dropIndex('api_key_hash_1')
  } catch {
    /* index not present — fine */
  }

  await database.collection('templates').createIndex({ project_id: 1, template_key: 1 }, { unique: true })
  await database.collection('message_logs').createIndex({ project_id: 1, created_at: -1 })
  await database.collection('message_logs').createIndex({ status: 1, next_retry_at: 1 })
  await database.collection('message_logs').createIndex({ provider_message_id: 1 })
  await database.collection('categories').createIndex({ name: 1 }, { unique: true })
  // Lets a template delete cascade-clean its category attachments in one indexed query.
  await database.collection('categories').createIndex({ 'templates.template_id': 1 })
  // Dashboard authorization: users + the projects each may access.
  await database.collection('users').createIndex({ email: 1 }, { unique: true })
  await database.collection('users').createIndex({ project_ids: 1 })
  // Per-project, multi-owner API keys.
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
