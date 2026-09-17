import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { wrapEmailHtml } from '../lib/template.js';
import { msUntilNextRun, readReminderSettings, reminderCutoff, reminderHtml, reminderSubject, } from '../lib/apiKeyExpiry.js';
import { sendViaProvider } from '../providers/httpProvider.js';
const WITHOUT_SECRETS = { value_encrypted: 0, key_hash: 0 };
export function startApiKeyExpirySweep() {
    const { enabled, days, hourIst } = readReminderSettings();
    if (!enabled) {
        console.log('API key expiry reminders are disabled (API_KEY_EXPIRY_REMINDER_ENABLED=false)');
        return;
    }
    const scheduleNext = () => {
        const wait = msUntilNextRun(new Date(), hourIst);
        setTimeout(() => {
            runSweep(days)
                .catch((err) => console.error('API key expiry sweep failed:', err))
                .finally(scheduleNext);
        }, wait);
        const at = new Date(Date.now() + wait).toISOString();
        console.log(`Next API key expiry check at ${at} (${hourIst}:00 IST)`);
    };
    scheduleNext();
    console.log(`API key expiry reminders started — warning ${days} day(s) ahead, daily`);
}
async function runSweep(days) {
    const now = new Date();
    const due = await getDb()
        .collection('api_keys')
        .find({
        status: 'active',
        expires_at: { $ne: null, $gt: now, $lte: reminderCutoff(now, days) },
        expiry_reminder_sent_at: null,
    }, { projection: WITHOUT_SECRETS })
        .toArray();
    if (due.length === 0)
        return;
    const directory = await loadDirectory(due);
    for (const key of due) {
        try {
            await remindOne(key, days, directory);
        }
        catch (err) {
            console.error(`API key expiry reminder failed for ${key._id.toString()}:`, err);
        }
    }
}
async function loadDirectory(due) {
    const db = getDb();
    const unique = (ids) => {
        const seen = new Map();
        for (const id of ids)
            if (id)
                seen.set(id.toString(), id);
        return [...seen.values()];
    };
    const projectIds = unique(due.map((k) => k.project_id));
    const creatorIds = unique(due.map((k) => k.created_by));
    const [projects, creators] = await Promise.all([
        db
            .collection('projects')
            .find({ _id: { $in: projectIds } }, { projection: { name: 1 } })
            .toArray(),
        creatorIds.length === 0
            ? Promise.resolve([])
            : db
                .collection('users')
                .find({ _id: { $in: creatorIds }, status: 'active' }, { projection: { email: 1 } })
                .toArray(),
    ]);
    const nameById = new Map(projects.map((p) => [p._id.toString(), p.name]));
    const emailById = new Map(creators.map((u) => [u._id.toString(), u.email]));
    let adminEmails = null;
    return {
        projectName: (id) => nameById.get(id.toString()) ?? 'Unknown project',
        creatorEmail: (id) => (id ? emailById.get(id.toString()) : undefined),
        admins: async () => {
            if (adminEmails === null) {
                const rows = await db
                    .collection('users')
                    .find({ role: 'admin', status: 'active' }, { projection: { email: 1 } })
                    .toArray();
                adminEmails = rows.map((r) => r.email).filter(Boolean);
            }
            return adminEmails;
        },
    };
}
async function remindOne(key, days, directory) {
    const keys = getDb().collection('api_keys');
    const claimed = await keys.findOneAndUpdate({ _id: key._id, status: 'active', expiry_reminder_sent_at: null }, { $set: { expiry_reminder_sent_at: new Date(), updated_at: new Date() } }, { returnDocument: 'after', projection: WITHOUT_SECRETS });
    if (!claimed?.expires_at)
        return;
    const creator = directory.creatorEmail(claimed.created_by);
    const recipients = creator ? [creator] : await directory.admins();
    if (recipients.length === 0) {
        console.error(`No one to warn about API key ${claimed._id.toString()} — its creator is inactive and no active admin exists`);
        return;
    }
    const context = {
        keyName: claimed.name,
        keyPrefix: claimed.key_prefix,
        projectName: directory.projectName(claimed.project_id),
        expiresAt: claimed.expires_at,
        days,
    };
    const subject = reminderSubject(context);
    const html = wrapEmailHtml(reminderHtml(context));
    try {
        for (const to of recipients) {
            await sendViaProvider('email', { to, subject, html });
        }
    }
    catch (err) {
        await keys.updateOne({ _id: claimed._id }, { $set: { expiry_reminder_sent_at: null } });
        throw err;
    }
    console.log(`Warned ${recipients.length} recipient(s) that API key ${claimed.key_prefix}… expires ${claimed.expires_at.toISOString()}`);
}
