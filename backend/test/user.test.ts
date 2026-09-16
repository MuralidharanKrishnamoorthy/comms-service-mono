import { test } from 'node:test'
import assert from 'node:assert/strict'
import { passwordSchema, changePasswordSchema } from './user.js'

test('passwordSchema rejects a password shorter than 8 characters', () => {
  const result = passwordSchema.safeParse('ab12')
  assert.equal(result.success, false)
})

test('passwordSchema rejects a password with no number', () => {
  const result = passwordSchema.safeParse('abcdefghij')
  assert.equal(result.success, false)
})

test('passwordSchema accepts a password with 8+ chars and a number', () => {
  const result = passwordSchema.safeParse('abcd1234')
  assert.equal(result.success, true)
})

test('changePasswordSchema requires a newPassword field', () => {
  assert.equal(changePasswordSchema.safeParse({}).success, false)
  assert.equal(changePasswordSchema.safeParse({ newPassword: 'short' }).success, false)
  assert.equal(changePasswordSchema.safeParse({ newPassword: 'abcd1234' }).success, true)
})
