// The values a brand-new template is born with, regardless of anything the
// client sent. A template always starts life awaiting review.
export function initialReviewFields() {
    return {
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
    };
}
// Admin approves: record who and when, and clear any stale rejection reason.
export function approvalFields(adminId, now) {
    return {
        status: 'approved',
        reviewed_by: adminId,
        reviewed_at: now,
        rejection_reason: null,
    };
}
// Admin rejects: record who, when, and the optional reason.
export function rejectionFields(adminId, reason, now) {
    return {
        status: 'rejected',
        reviewed_by: adminId,
        reviewed_at: now,
        rejection_reason: reason?.trim() ? reason.trim() : null,
    };
}
// When a creator edits a template, a prior review no longer applies — an
// approved or rejected template drops back to "pending" and its audit fields
// clear. A template that is already pending is left untouched, so returns null
// (the caller then writes no review fields). This keeps an approved template
// from silently staying approved after its content changed underneath the
// admin who signed off on it.
export function resetReviewForEdit(current) {
    if (current === 'pending')
        return null;
    return initialReviewFields();
}
// The single server-side gate for "may this template be used?". Every place
// that applies a template (send, category attachment) funnels through this, so
// the rule lives in exactly one spot.
export function isUsable(template) {
    return template.status === 'approved';
}
// Translate an admin's status filter into a Mongo query fragment. "all" (and
// any unknown value) imposes no status constraint.
export function statusFilter(filter) {
    if (filter === 'pending' || filter === 'approved' || filter === 'rejected') {
        return { status: filter };
    }
    return {};
}
