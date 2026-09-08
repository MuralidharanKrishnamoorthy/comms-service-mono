import { MongoClient } from 'mongodb';
const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;
if (!uri) {
    throw new Error('MONGODB_URI is not set in backend/.env');
}
if (!dbName) {
    throw new Error('DB_NAME is not set in backend/.env');
}
const client = new MongoClient(uri);
let db = null;
async function ensureIndexes(database) {
    try {
        await database.collection('projects').dropIndex('api_key_hash_1');
    }
    catch {
    }
    await database.collection('templates').createIndex({ project_id: 1, template_key: 1 }, { unique: true });
    await database.collection('message_logs').createIndex({ project_id: 1, created_at: -1 });
    await database.collection('message_logs').createIndex({ status: 1, next_retry_at: 1 });
    await database.collection('message_logs').createIndex({ provider_message_id: 1 });
    await database.collection('categories').createIndex({ name: 1 }, { unique: true });
    await database.collection('categories').createIndex({ 'templates.template_id': 1 });
    await database.collection('users').createIndex({ email: 1 }, { unique: true });
    await database.collection('users').createIndex({ project_ids: 1 });
    await database.collection('api_keys').createIndex({ project_id: 1 });
    await database.collection('api_keys').createIndex({ project_id: 1, created_by: 1 });
    await database.collection('api_keys').createIndex({ key_hash: 1 }, { unique: true });
}
export async function connectDb() {
    if (db)
        return db;
    await client.connect();
    db = client.db(dbName);
    await ensureIndexes(db);
    console.log(`Connected to MongoDB database "${dbName}"`);
    return db;
}
export function getDb() {
    if (!db) {
        throw new Error('Database not connected yet — call connectDb() before getDb()');
    }
    return db;
}
