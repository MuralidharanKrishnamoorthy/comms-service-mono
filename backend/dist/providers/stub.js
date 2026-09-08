import { randomUUID } from 'node:crypto';
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
