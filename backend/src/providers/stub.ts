import { randomUUID } from 'node:crypto'
import type { EmailProvider, SmsProvider, PushProvider } from './types.js'

export const stubEmailProvider: EmailProvider = {
  async send(payload) {
    console.log('[stub email]', payload)
    return { providerMessageId: `stub_email_${randomUUID()}` }
  },
}

export const stubSmsProvider: SmsProvider = {
  async send(payload) {
    console.log('[stub sms]', payload)
    return { providerMessageId: `stub_sms_${randomUUID()}` }
  },
}

export const stubPushProvider: PushProvider = {
  async send(payload) {
    console.log('[stub push]', payload)
    return { providerMessageId: `stub_push_${randomUUID()}` }
  },
}
