import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { approvalFields, rejectionFields, resetReviewForEdit, initialReviewFields, isUsable, statusFilter, } from './templateReview.js';
import { rejectTemplateSchema } from '../models/template.js';
const adminId = new ObjectId();
const now = new Date('2026-09-15T10:00:00.000Z');
test('a new template starts pending with empty audit fields', () => {
    assert.deepEqual(initialReviewFields(), {
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
    });
});
test('approvalFields sets approved + records reviewer/time and clears any reason', () => {
    const fields = approvalFields(adminId, now);
    assert.equal(fields.status, 'approved');
    assert.ok(fields.reviewed_by?.equals(adminId));
    assert.equal(fields.reviewed_at, now);
    assert.equal(fields.rejection_reason, null);
});
test('rejectionFields sets rejected + records reviewer/time and keeps the reason', () => {
    const fields = rejectionFields(adminId, 'Subject line is off-brand', now);
    assert.equal(fields.status, 'rejected');
    assert.ok(fields.reviewed_by?.equals(adminId));
    assert.equal(fields.reviewed_at, now);
    assert.equal(fields.rejection_reason, 'Subject line is off-brand');
});
test('rejectionFields normalises a blank/whitespace reason to null', () => {
    assert.equal(rejectionFields(adminId, '   ', now).rejection_reason, null);
    assert.equal(rejectionFields(adminId, undefined, now).rejection_reason, null);
});
test('editing a rejected template resets it back to pending and clears the reason', () => {
    const reset = resetReviewForEdit('rejected');
    assert.notEqual(reset, null);
    assert.equal(reset.status, 'pending');
    assert.equal(reset.rejection_reason, null);
    assert.equal(reset.reviewed_by, null);
    assert.equal(reset.reviewed_at, null);
});
test('editing an approved template resets it back to pending', () => {
    assert.equal(resetReviewForEdit('approved').status, 'pending');
});
test('editing an already-pending template leaves the review state untouched', () => {
    assert.equal(resetReviewForEdit('pending'), null);
});
test('only approved templates are usable', () => {
    assert.equal(isUsable({ status: 'approved' }), true);
    assert.equal(isUsable({ status: 'pending' }), false);
    assert.equal(isUsable({ status: 'rejected' }), false);
});
test('statusFilter constrains by status, but "all" imposes none', () => {
    assert.deepEqual(statusFilter('pending'), { status: 'pending' });
    assert.deepEqual(statusFilter('approved'), { status: 'approved' });
    assert.deepEqual(statusFilter('rejected'), { status: 'rejected' });
    assert.deepEqual(statusFilter('all'), {});
});
test('rejectTemplateSchema accepts an optional reason and an empty body', () => {
    assert.equal(rejectTemplateSchema.safeParse({}).success, true);
    assert.equal(rejectTemplateSchema.safeParse({ reason: 'too long' }).success, true);
    assert.equal(rejectTemplateSchema.safeParse({ reason: 'x'.repeat(2001) }).success, false);
});
