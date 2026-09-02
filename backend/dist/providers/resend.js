import { Resend } from 'resend';
const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set in backend/.env');
}
const resend = new Resend(apiKey);
// Demo sender — Resend's shared address, works without verifying a custom
// domain. Swap for a verified "you@yourdomain.com" once one is set up.
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? 'onboarding@resend.dev';
export const resendEmailProvider = {
    async send(payload) {
        const { data, error } = await resend.emails.send({
            from: FROM_ADDRESS,
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
        });
        if (error || !data) {
            throw new Error(`Resend send failed: ${error?.message ?? 'unknown error'}`);
        }
        return { providerMessageId: data.id, raw: data };
    },
};
