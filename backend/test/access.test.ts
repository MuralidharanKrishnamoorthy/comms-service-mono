import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ObjectId } from 'mongodb'
import { allowedProjectIds, hasProjectAccess, type AccessUser } from '../src/lib/access.js'

const PROJECT_A = new ObjectId()
const PROJECT_B = new ObjectId()
const PROJECT_C = new ObjectId()

const user = (role: AccessUser['role'], projects: ObjectId[]): AccessUser => ({
  _id: new ObjectId(),
  role,
  project_ids: projects,
})

describe('hasProjectAccess', () => {
  test('a member reaches their own project', () => {
    assert.equal(hasProjectAccess(user('developer', [PROJECT_A]), PROJECT_A.toString()), true)
  })

  test('two members of the same project both reach it', () => {
    assert.equal(hasProjectAccess(user('developer', [PROJECT_A]), PROJECT_A.toString()), true)
    assert.equal(hasProjectAccess(user('ba', [PROJECT_A]), PROJECT_A.toString()), true)
  })

  test('a member of another project is refused', () => {
    assert.equal(hasProjectAccess(user('developer', [PROJECT_B]), PROJECT_A.toString()), false)
  })

  test('a user with no projects is refused', () => {
    assert.equal(hasProjectAccess(user('tester', []), PROJECT_A.toString()), false)
  })

  test('a member of several projects reaches each of them', () => {
    const multi = user('developer', [PROJECT_A, PROJECT_B])
    assert.equal(hasProjectAccess(multi, PROJECT_A.toString()), true)
    assert.equal(hasProjectAccess(multi, PROJECT_B.toString()), true)
    assert.equal(hasProjectAccess(multi, PROJECT_C.toString()), false)
  })

  test('an admin reaches every project without membership', () => {
    const admin = user('admin', [])
    assert.equal(hasProjectAccess(admin, PROJECT_A.toString()), true)
    assert.equal(hasProjectAccess(admin, new ObjectId().toString()), true)
  })

  test('every non-admin role is treated identically', () => {
    for (const role of ['developer', 'ba', 'tester'] as const) {
      assert.equal(hasProjectAccess(user(role, [PROJECT_A]), PROJECT_A.toString()), true, role)
      assert.equal(hasProjectAccess(user(role, [PROJECT_A]), PROJECT_B.toString()), false, role)
    }
  })

  test('a malformed project id is refused rather than throwing', () => {
    assert.equal(hasProjectAccess(user('developer', [PROJECT_A]), 'not-an-object-id'), false)
    assert.equal(hasProjectAccess(user('developer', [PROJECT_A]), ''), false)
  })

  test('it is synchronous, so a forgotten await cannot make it truthy', () => {
    assert.equal(typeof hasProjectAccess(user('tester', []), PROJECT_A.toString()), 'boolean')
  })
})

describe('allowedProjectIds', () => {
  test('an admin gets null, meaning no filter', () => {
    assert.equal(allowedProjectIds(user('admin', [])), null)
  })

  test('a member gets exactly their own project list', () => {
    assert.deepEqual(allowedProjectIds(user('developer', [PROJECT_A, PROJECT_B])), [PROJECT_A, PROJECT_B])
  })

  test('a user with no projects gets an empty list, not null', () => {
    const result = allowedProjectIds(user('tester', []))
    assert.notEqual(result, null)
    assert.equal(result!.length, 0)
  })
})
