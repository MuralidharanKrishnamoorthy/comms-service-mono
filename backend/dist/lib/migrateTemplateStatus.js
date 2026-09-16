import { getDb } from '../db.js';
// Backfills the approval fields onto templates that predate the approval
// workflow. Existing templates were already in active use, so they are marked
// "approved" rather than "pending" — flipping the whole catalogue to pending
// would instantly break every live send. New templates created from now on go
// through the normal pending → approved/rejected flow (admins' own are approved
// on creation).
//
// Idempotent: only rows still missing `status` are touched, so it is a no-op on
// every boot after the first.
export async function migrateTemplateStatus() {
    const db = getDb();
    const result = await db.collection('templates').updateMany({ status: { $exists: false } }, {
        $set: {
            status: 'approved',
            created_by: null,
            reviewed_by: null,
            reviewed_at: null,
            rejection_reason: null,
        },
    });
    if (result.modifiedCount > 0) {
        console.warn(`[templates] backfilled approval status on ${result.modifiedCount} pre-existing template(s) as "approved".`);
    }
}
