import { z } from 'zod';
const channelContentSchema = z.object({
    subject: z.string().optional(), // email only
    html_body: z.string().optional(), // email only
    title: z.string().optional(), // push only
    body: z.string().optional(), // sms / push
    variables: z.array(z.string()).default([]),
});
export const createTemplateSchema = z.object({
    template_key: z
        .string()
        .min(1)
        .max(80)
        .regex(/^[A-Z0-9_]+$/, 'template_key must be UPPER_SNAKE_CASE, e.g. ORDER_CREATED'),
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
