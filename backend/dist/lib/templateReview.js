// The values a template awaiting review is born with, regardless of anything the
// client sent. Used for templates created by a non-admin.
export function initialReviewFields() {
    return {
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
        remarks: null,
    };
}
// An admin's own template skips the queue: it is born approved, self-reviewed,
// so the audit trail still records who signed off (themselves) and when.
export function autoApprovedReviewFields(adminId, now) {
    return {
        status: 'approved',
        reviewed_by: adminId,
        reviewed_at: now,
        rejection_reason: null,
        remarks: null,
    };
}
// Admin approves: record who and when, and clear any stale reason/remarks.
export function approvalFields(adminId, now) {
    return {
        status: 'approved',
        reviewed_by: adminId,
        reviewed_at: now,
        rejection_reason: null,
        remarks: null,
    };
}
// Admin rejects: record who, when, and the optional reason. Clears any remarks
// left over from a prior "returned" state.
export function rejectionFields(adminId, reason, now) {
    return {
        status: 'rejected',
        reviewed_by: adminId,
        reviewed_at: now,
        rejection_reason: reason?.trim() ? reason.trim() : null,
        remarks: null,
    };
}
// Admin returns for edits: record who, when, and the required remarks. Clears
// any rejection_reason left over from a prior "rejected" state. Remarks are
// required at the schema layer, so a caller never reaches here with a blank one.
export function returnFields(adminId, remarks, now) {
    return {
        status: 'returned',
        reviewed_by: adminId,
        reviewed_at: now,
        rejection_reason: null,
        remarks: remarks.trim(),
    };
}
// A rejected template is a dead end by design: its content is locked and no
// edit may resurrect it. Every content-edit path asks this first, before
// touching anything, and refuses when it returns true (see routes/templates.ts).
// Only a separate admin reopen action could move a template out of "rejected" —
// an ordinary content save must never flip it back to "pending".
export function isEditLocked(current) {
    return current === 'rejected';
}
// When a template's content is edited, a prior review no longer applies — an
// approved or returned template drops back to "pending" and its audit fields
// (reason, remarks, reviewer, time) clear. A template that is already pending is
// left untouched, and a rejected one is never reached here (edits are blocked
// upstream by isEditLocked) — either way this returns null so the caller writes
// no review fields. This keeps an approved template from silently staying
// approved after its content changed underneath the admin who signed off on it,
// a returned one from keeping stale remarks after the author addressed them, and
// a rejected one from ever being reopened by a content edit.
export function resetReviewForEdit(current) {
    if (current === 'pending' || current === 'rejected')
        return null;
    return initialReviewFields();
}
// The single server-side gate for "may this template be used?". Every place
// that applies a template (send) funnels through this, so the rule lives in
// exactly one spot.
export function isUsable(template) {
    return template.status === 'approved';
}
// Translate a status filter into a Mongo query fragment. "all" (and any unknown
// value) imposes no status constraint.
export function statusFilter(filter) {
    if (filter === 'pending' || filter === 'approved' || filter === 'rejected' || filter === 'returned') {
        return { status: filter };
    }
    return {};
}
