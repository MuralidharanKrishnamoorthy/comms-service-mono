import { z } from 'zod'
import type { ObjectId } from 'mongodb'

export const ROLES = ['admin', 'developer', 'ba', 'tester'] as const
export type Role = (typeof ROLES)[number]

export interface User {
  _id?: ObjectId
  email: string
  name: string
  password_hash: string
  role: Role
  status: 'active' | 'disabled'

  project_ids: ObjectId[]

  must_change_password?: boolean
  created_at: Date
  updated_at: Date
}

export interface SafeUser {
  _id: ObjectId
  email: string
  name: string
  role: Role
  status: 'active' | 'disabled'
  created_at: Date
  updated_at: Date
  project_ids: string[]
}

const objectIdString = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id')

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[0-9]/, 'Password must include at least one number')

export const changePasswordSchema = z.object({
  newPassword: passwordSchema,
})

export const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  role: z.enum(ROLES),
  project_ids: z.array(objectIdString).optional(),
})

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
