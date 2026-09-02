import { z } from 'zod'
import type { ObjectId } from 'mongodb'

// admin is unrestricted; developer / ba / tester are all scoped IDENTICALLY to
// their project_members rows. Authorization logic must branch only on
// `role === 'admin'` vs everything else — never a per-role allowlist. The three
// non-admin roles differ only in their UI label/badge.
export const ROLES = ['admin', 'developer', 'ba', 'tester'] as const
export type Role = (typeof ROLES)[number]

export interface User {
  _id?: ObjectId
  email: string // stored lowercased; unique
  name: string
  password_hash: string // NEVER returned by any API
  role: Role
  status: 'active' | 'disabled'
  created_at: Date
  updated_at: Date
}

// What the API is allowed to expose about a user — no password material, ever.
export interface SafeUser {
  _id: ObjectId
  email: string
  name: string
  role: Role
  status: 'active' | 'disabled'
  created_at: Date
  updated_at: Date
  project_ids: string[] // membership project ids (empty for admin)
}

const objectIdString = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id')

// Password is admin-set. Required on create.
export const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  role: z.enum(ROLES),
  project_ids: z.array(objectIdString).optional(),
})

// All fields optional; password OMITTED = leave unchanged, PRESENT = reset it.
// At least one field must be provided.
export const updateUserSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    email: z.string().email().max(200).optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').max(200).optional(),
    role: z.enum(ROLES).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    project_ids: z.array(objectIdString).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  })

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
