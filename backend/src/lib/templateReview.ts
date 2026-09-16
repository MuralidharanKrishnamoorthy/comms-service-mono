import type { ObjectId, Filter } from 'mongodb'
import type { Template, TemplateStatus, TemplateStatusFilter } from '../models/template.js'

// The subset of a template's approval fields that a write touches. Kept as a
// plain object (not a Mongo `$set`) so these helpers stay pure and unit-testable
// without a database; the routes spread the result straight into `$set`.
export interface ReviewFields {
  status: TemplateStatus
  reviewed_by: ObjectId | null
  reviewed_at: Date | null
  rejection_reason: string | null
}

// The values a template awaiting review is born with, regardless of anything the
// client sent. Used for templates created by a non-admin.
export function initialReviewFields(): ReviewFields {
  return {
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: null,
  }
}

// An admin's own template skips the queue: it is born approved, self-reviewed,
// so the audit trail still records who signed off (themselves) and when.
export function autoApprovedReviewFields(adminId: ObjectId, now: Date): ReviewFields {
  return {
    status: 'approved',
    reviewed_by: adminId,
    reviewed_at: now,
    rejection_reason: null,
  }
}

// Admin approves: record who and when, and clear any stale rejection reason.
export function approvalFields(adminId: ObjectId, now: Date): ReviewFields {
  return {
    status: 'approved',
    reviewed_by: adminId,
    reviewed_at: now,
    rejection_reason: null,
  }
}

// Admin rejects: record who, when, and the optional reason.
export function rejectionFields(adminId: ObjectId, reason: string | undefined, now: Date): ReviewFields {
  return {
    status: 'rejected',
    reviewed_by: adminId,
    reviewed_at: now,
    rejection_reason: reason?.trim() ? reason.trim() : null,
  }
}

// When a template's content is edited, a prior review no longer applies — an
// approved or rejected template drops back to "pending" and its audit fields
// clear. A template that is already pending is left untouched, so returns null
// (the caller then writes no review fields). This keeps an approved template
// from silently staying approved after its content changed underneath the
// admin who signed off on it.
export function resetReviewForEdit(current: TemplateStatus): ReviewFields | null {
  if (current === 'pending') return null
  return initialReviewFields()
}

// The single server-side gate for "may this template be used?". Every place
// that applies a template (send) funnels through this, so the rule lives in
// exactly one spot.
export function isUsable(template: Pick<Template, 'status'>): boolean {
  return template.status === 'approved'
}

// Translate a status filter into a Mongo query fragment. "all" (and any unknown
// value) imposes no status constraint.
export function statusFilter(filter: TemplateStatusFilter): Filter<Template> {
  if (filter === 'pending' || filter === 'approved' || filter === 'rejected') {
    return { status: filter }
  }
  return {}
}
