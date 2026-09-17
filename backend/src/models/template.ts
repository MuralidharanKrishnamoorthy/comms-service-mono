import { z } from 'zod'
import type { ObjectId } from 'mongodb'
export function normalizeTemplateKey(key: string): string {
  return key.trim().toUpperCase()
}

const channelContentSchema = z.object({
  subject: z.string().optional(),
  html_body: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  variables: z.array(z.string()).default([]),
})

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

// The approval lifecycle. A template is born "pending" (or "approved" outright
// when an admin creates it — an admin's own work needs no second sign-off), an
// admin moves it to "approved", "rejected", or "returned" (sent back for edits
// with required remarks), and any content edit sends it back to "pending" (see
// resetReviewForEdit in lib/templateReview).
export const TEMPLATE_STATUSES = ['pending', 'approved', 'rejected', 'returned'] as const
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number]

// Admins filter the templates list by status; "all" means no filter.
export const TEMPLATE_STATUS_FILTERS = ['pending', 'approved', 'rejected', 'returned', 'all'] as const
export type TemplateStatusFilter = (typeof TEMPLATE_STATUS_FILTERS)[number]

export const rejectTemplateSchema = z.object({
  reason: z.string().max(2000).optional(),
})

// Returning a template is feedback, not a verdict: remarks explaining what needs
// to change are required. Trimmed, so whitespace-only remarks are rejected.
export const returnTemplateSchema = z.object({
  remarks: z.string().trim().min(1, 'remarks is required').max(2000),
})

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
  template_key: string
  name: string
  channels: {
    email?: ChannelContent
    sms?: ChannelContent
    push?: ChannelContent
  }

  // Approval workflow. `status` gates whether the template may actually be used
  // (only "approved" templates can be sent — see routes/send.ts). The review
  // fields form an audit trail: who reviewed it, when, and — for a rejection or
  // return — the note the admin left. `rejection_reason` is set only when
  // rejected; `remarks` only when returned. `created_by` is the dashboard user
  // who submitted it; nullable only on rows created before this field existed
  // (backfilled by migrateTemplateStatus).
  status: TemplateStatus
  created_by: ObjectId | null
  reviewed_by: ObjectId | null
  reviewed_at: Date | null
  rejection_reason: string | null
  remarks: string | null

  created_at: Date
  updated_at: Date
}
