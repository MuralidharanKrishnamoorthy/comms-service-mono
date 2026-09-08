import { z } from 'zod';
export function normalizeTemplateKey(key) {
    return key.trim().toUpperCase();
}
const channelContentSchema = z.object({
    subject: z.string().optional(),
    html_body: z.string().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    variables: z.array(z.string()).default([]),
});
export const createTemplateSchema = z.object({
    template_key: z
        .string()
        .min(1)
        .max(80)
        .regex(/^[A-Za-z0-9_]+$/, 'template_key may only contain letters, numbers and underscores')
        .transform(normalizeTemplateKey),
    name: z.string().min(1).max(120),
    channels: z
        .object({
        email: channelContentSchema.optional(),
        sms: channelContentSchema.optional(),
        push: channelContentSchema.optional(),
    })
        .superRefine((c, ctx) => {
        if (!c.email && !c.sms && !c.push) {
            ctx.addIssue({ code: 'custom', message: 'At least one channel (email, sms, or push) is required' });
            return;
        }
        if (c.email && !c.email.html_body?.trim()) {
            ctx.addIssue({ code: 'custom', path: ['email', 'html_body'], message: 'email channel requires html_body' });
        }
        if (c.email && !c.email.subject?.trim()) {
            ctx.addIssue({ code: 'custom', path: ['email', 'subject'], message: 'email channel requires subject' });
        }
        if (c.sms && !c.sms.body?.trim()) {
            ctx.addIssue({ code: 'custom', path: ['sms', 'body'], message: 'sms channel requires body' });
        }
        if (c.push && !c.push.body?.trim()) {
            ctx.addIssue({ code: 'custom', path: ['push', 'body'], message: 'push channel requires body' });
        }
    }),
});
export const updateChannelContentSchema = channelContentSchema.partial().refine((c) => Object.keys(c).length > 0, { message: 'At least one field must be provided to update' });
