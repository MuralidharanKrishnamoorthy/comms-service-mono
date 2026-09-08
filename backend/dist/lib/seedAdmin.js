import { getDb } from '../db.js';
import { hashPassword } from './password.js';
export async function seedAdmin() {
    const db = getDb();
    await db
        .collection('users')
        .updateMany({ project_ids: { $exists: false } }, { $set: { project_ids: [] } });
    const count = await db.collection('users').estimatedDocumentCount();
    if (count > 0)
        return;
    const email = (process.env.SEED_ADMIN_EMAIL || 'admin@local.dev').toLowerCase().trim();
    const password = process.env.SEED_ADMIN_PASSWORD || 'admin12345';
    const now = new Date();
    await db.collection('users').insertOne({
        name: 'Administrator',
        email,
        password_hash: hashPassword(password),
        role: 'admin',
        status: 'active',
        project_ids: [],
        must_change_password: false,
        created_at: now,
        updated_at: now,
    });
    console.warn(`[auth] No users found — seeded an admin account: ${email} / ${password}\n` +
        '       Change this immediately (set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, ' +
        'or edit the user in the dashboard).');
}
