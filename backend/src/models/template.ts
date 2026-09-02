import { z } from 'zod'
import type { ObjectId } from 'mongodb'

const channelContentSchema = z.object({
  subject: z.string().optional(), // email only
  html_body: z.string().optional(), // email only
  title: z.string().optional(), // push only
  body: z.string().optional(), // sms / push
  variables: z.array(z.string()).default([]),
})

export const createTemplateSchema = z.object({
  category: z.string().max(60).optional().default('General'),
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
        ctx.addIssue({ code: 'custom', message: 'At least one channel (email, sms, or push) is required' })
        return
      }
      if (c.email && !c.email.html_body?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['email', 'html_body'], message: 'email channel requires html_body' })
      }
      if (c.email && !c.email.subject?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['email', 'subject'], message: 'email channel requires subject' })
      }
      if (c.sms && !c.sms.body?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['sms', 'body'], message: 'sms channel requires body' })
      }
      if (c.push && !c.push.body?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['push', 'body'], message: 'push channel requires body' })
      }
    }),
})

export const updateChannelContentSchema = channelContentSchema.partial().refine(
  (c) => Object.keys(c).length > 0,
  { message: 'At least one field must be provided to update' }
)

export interface ChannelContent {
  subject?: string
  html_body?: string
  title?: string
  body?: string
  variables: string[]
  version: number
  live: boolean
}

export interface Template {
  _id?: ObjectId
  project_id: ObjectId
  category: string
  template_key: string
  name: string
  channels: {
    email?: ChannelContent
    sms?: ChannelContent
    push?: ChannelContent
  }
  created_at: Date
  updated_at: Date
}
