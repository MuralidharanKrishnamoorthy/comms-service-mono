import { getDb } from '../db.js';
import { dispatchSend } from '../lib/dispatch.js';
import { markSent, markFailedAndScheduleRetry } from '../lib/messageLog.js';
const SWEEP_INTERVAL_MS = 30_000;
export function startRetrySweep() {
    setInterval(() => {
        runRetrySweep().catch((err) => console.error('Retry sweep failed:', err));
    }, SWEEP_INTERVAL_MS);
    console.log(`Retry sweep started — checking every ${SWEEP_INTERVAL_MS / 1000}s`);
}
async function runRetrySweep() {
    const db = getDb();
    const due = await db
        .collection('message_logs')
        .find({ status: 'pending', next_retry_at: { $lte: new Date() } })
        .toArray();
    for (const log of due) {
        await retryOne(log);
    }
}
async function retryOne(log) {
    const db = getDb();
    const template = await db.collection('templates').findOne({ _id: log.template_id });
    // Template or its channel was deleted/changed since the original attempt —
    // nothing sane to retry with, so stop retrying instead of looping forever.
    const channelContent = template?.channels[log.channel];
    if (!template || !channelContent) {
        await db.collection('message_logs').updateOne({ _id: log._id }, { $set: { status: 'failed', updated_at: new Date() } });
        return;
    }
    try {
        const providerMessageId = await dispatchSend(log.channel, channelContent, log.recipient, log.data);
        await markSent(log._id, providerMessageId);
    }
    catch (err) {
        console.error(`Retry failed for message_log ${log._id}:`, err);
        await markFailedAndScheduleRetry(log._id, log.attempts);
    }
}
