import { randomUUID } from 'node:crypto';
/**
 * Stand-ins for the real SendGrid/Twilio/FCM adapters. Same interface as the
 * real providers will use, so swapping these out later is a one-file change
 * per channel, not a rewrite of the send endpoint.
 */
export const stubEmailProvider = {
    async send(payload) {
        console.log('[stub email]', payload);
        return { providerMessageId: `stub_email_${randomUUID()}` };
    },
};
export const stubSmsProvider = {
    async send(payload) {
        console.log('[stub sms]', payload);
        return { providerMessageId: `stub_sms_${randomUUID()}` };
    },
};
export const stubPushProvider = {
    async send(payload) {
        console.log('[stub push]', payload);
        return { providerMessageId: `stub_push_${randomUUID()}` };
    },
};
