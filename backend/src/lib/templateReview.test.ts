import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isEditLocked, resetReviewForEdit } from './templateReview.js'

// A rejected template is a dead end: content edits are locked and must never
// reopen it. A returned or approved one drops back to "pending" on edit; a
// pending one is left untouched. These two pure functions are the whole rule.

test('a rejected template is locked against edits', () => {
  assert.equal(isEditLocked('rejected'), true)
})

test('pending, approved and returned templates are editable', () => {
  assert.equal(isEditLocked('pending'), false)
  assert.equal(isEditLocked('approved'), false)
  assert.equal(isEditLocked('returned'), false)
})

test('editing a returned template drops it back to pending and clears remarks', () => {
  const fields = resetReviewForEdit('returned')
  assert.ok(fields)
  assert.equal(fields.status, 'pending')
  assert.equal(fields.remarks, null)
  assert.equal(fields.rejection_reason, null)
  assert.equal(fields.reviewed_by, null)
  assert.equal(fields.reviewed_at, null)
})

test('editing an approved template drops it back to pending', () => {
  const fields = resetReviewForEdit('approved')
  assert.ok(fields)
  assert.equal(fields.status, 'pending')
})

test('editing an already-pending template changes no review fields', () => {
  assert.equal(resetReviewForEdit('pending'), null)
})

test('a rejected template never reopens to pending via an edit', () => {
  // Edits are blocked upstream by isEditLocked, but even if reached, the reset
  // must never resurrect a rejected template — it returns null (no change).
  assert.equal(resetReviewForEdit('rejected'), null)
})
