import { getDb } from '../db.js';
import { encryptSecret } from './crypto.js';
import { keyPrefix } from './apiKey.js';
export async function migrateApiKeys() {
    const db = getDb();
    const legacy = await db
        .collection('projects')
        .find({ api_key_hash: { $exists: true } })
        .toArray();
    if (legacy.length === 0)
        return;
    const owner = (await db.collection('users').findOne({ role: 'admin' }, { sort: { created_at: 1 } })) ??
        (await db.collection('users').findOne({}, { sort: { created_at: 1 } }));
    if (!owner) {
        console.warn('[api-keys] migration deferred — no users exist yet to own migrated keys');
        return;
    }
    let migrated = 0;
    for (const project of legacy) {
        const hash = project.api_key_hash;
        const existing = await db.collection('api_keys').findOne({ key_hash: hash });
        if (!existing) {
            const now = new Date();
            const row = {
                project_id: project._id,
                name: 'Migrated key',
                key_prefix: project.api_key ? keyPrefix(project.api_key) : 'csvc_…',
                key_hash: hash,
                value_encrypted: project.api_key ? encryptSecret(project.api_key) : null,
                created_by: owner._id,
                status: project.status === 'active' ? 'active' : 'revoked',
                expires_at: null,
                created_at: project.created_at ?? now,
                updated_at: now,
            };
            await db.collection('api_keys').insertOne(row);
            migrated++;
        }
        await db
            .collection('projects')
            .updateOne({ _id: project._id }, { $unset: { api_key: '', api_key_hash: '' } });
    }
    console.warn(`[api-keys] migrated ${migrated} legacy project key(s) into the api_keys collection ` +
        `(owner: ${owner.email}). Legacy fields removed from projects.`);
}
