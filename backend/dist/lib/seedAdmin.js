import { getDb } from '../db.js';
import { hashPassword } from './password.js';
// Ensures at least one admin exists so the dashboard is reachable on a fresh DB.
// Credentials come from env, falling back to a loud dev default. Runs once at
// startup and does nothing if any user already exists.
export async function seedAdmin() {
    const db = getDb();
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
        created_at: now,
        updated_at: now,
    });
    console.warn(`[auth] No users found — seeded an admin account: ${email} / ${password}\n` +
        '       Change this immediately (set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, ' +
        'or edit the user in the dashboard).');
}
