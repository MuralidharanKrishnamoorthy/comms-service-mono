import { getDb } from '../db.js'
import { dispatchSend } from '../lib/dispatch.js'
import { markSent, markFailedAndScheduleRetry } from '../lib/messageLog.js'
import type { MessageLog } from '../models/messageLog.js'
import type { Template } from '../models/template.js'

const SWEEP_INTERVAL_MS = 30_000

/**
 * Every SWEEP_INTERVAL_MS, re-attempts any message_logs row that's still
 * "pending" and whose next_retry_at has passed. This is the entire retry
 * mechanism — no queue, no external worker, just this interval against
 * the database we already have.
 */
export function startRetrySweep() {
  setInterval(() => {
    runRetrySweep().catch((err) => console.error('Retry sweep failed:', err))
  }, SWEEP_INTERVAL_MS)
  console.log(`Retry sweep started — checking every ${SWEEP_INTERVAL_MS / 1000}s`)
}

async function runRetrySweep() {
  const db = getDb()
  const due = await db
    .collection<MessageLog>('message_logs')
    .find({ status: 'pending', next_retry_at: { $lte: new Date() } })
    .toArray()

  for (const log of due) {
    await retryOne(log)
  }
}

async function retryOne(log: MessageLog) {
  const db = getDb()
  const template = await db.collection<Template>('templates').findOne({ _id: log.template_id })

  // Template or its channel was deleted/changed since the original attempt —
  // nothing sane to retry with, so stop retrying instead of looping forever.
  const channelContent = template?.channels[log.channel]
  if (!template || !channelContent) {
    await db.collection<MessageLog>('message_logs').updateOne(
      { _id: log._id },
      { $set: { status: 'failed', updated_at: new Date() } }
    )
    return
  }

  try {
    const providerMessageId = await dispatchSend(log.channel, channelContent, log.recipient, log.data)
    await markSent(log._id!, providerMessageId)
  } catch (err) {
    console.error(`Retry failed for message_log ${log._id}:`, err)
    await markFailedAndScheduleRetry(log._id!, log.attempts)
  }
}
