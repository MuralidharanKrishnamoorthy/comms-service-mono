import type { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import type { MessageLog } from '../models/messageLog.js'

const MAX_ATTEMPTS = 5
const BASE_DELAY_SECONDS = 30
const MAX_DELAY_SECONDS = 30 * 60 // cap backoff at 30 minutes

export async function createMessageLog(
  input: Omit<MessageLog, '_id' | 'status' | 'attempts' | 'created_at' | 'updated_at'>
) {
  const db = getDb()
  const log: MessageLog = {
    ...input,
    status: 'pending',
    attempts: 0,
    created_at: new Date(),
    updated_at: new Date(),
  }
  const result = await db.collection<MessageLog>('message_logs').insertOne(log)
  return { id: result.insertedId, ...log }
}

export async function markSent(logId: ObjectId, providerMessageId: string) {
  const db = getDb()
  await db.collection<MessageLog>('message_logs').updateOne(
    { _id: logId },
    { $set: { status: 'sent', provider_message_id: providerMessageId, updated_at: new Date() } }
  )
}

/**
 * Records a failed attempt. Below MAX_ATTEMPTS, schedules a retry with
 * exponential backoff and keeps status "pending" so the sweep picks it back
 * up. At MAX_ATTEMPTS, marks it permanently "failed" — no further retries.
 */
export async function markFailedAndScheduleRetry(logId: ObjectId, attemptsSoFar: number) {
  const db = getDb()
  const attempts = attemptsSoFar + 1

  if (attempts >= MAX_ATTEMPTS) {
    await db.collection<MessageLog>('message_logs').updateOne(
      { _id: logId },
      { $set: { status: 'failed', attempts, updated_at: new Date() } }
    )
    return
  }

  const delaySeconds = Math.min(BASE_DELAY_SECONDS * 2 ** attempts, MAX_DELAY_SECONDS)
  const nextRetryAt = new Date(Date.now() + delaySeconds * 1000)

  await db.collection<MessageLog>('message_logs').updateOne(
    { _id: logId },
    { $set: { status: 'pending', attempts, next_retry_at: nextRetryAt, updated_at: new Date() } }
  )
}
