import { z } from 'zod'
import type { ObjectId } from 'mongodb'
import { normalizeTemplateKey } from './template.js'

const objectIdString = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id')

// A category is visible to whoever shares one of its projects, so a category
// with no templates belongs to no project and nobody could see it — including
// whoever just made it. At least one attachment is what gives it a home.
export const createCategorySchema = z.object({
  name: z.string().min(1).max(60),
  templates: z
    .array(
      z.object({
        project_id: objectIdString,
        template_key: z.string().min(1).max(80).transform(normalizeTemplateKey),
      })
    )
    .min(1, 'Choose at least one template for this category')
    .max(200, 'Too many templates in one request'),
})

export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    // Same reason as on create: detaching the last template would strand the
    // category in no project at all.
    templates: z
      .array(
        z.object({
          project_id: objectIdString,
          template_key: z.string().min(1).max(80).transform(normalizeTemplateKey),
        })
      )
      .min(1, 'A category must keep at least one template')
      .max(200, 'Too many templates in one request')
      .optional(),
  })
  .refine((v) => v.name !== undefined || v.templates !== undefined, {
    message: 'Provide a name, templates, or both',
  })

export interface AttachedTemplate {
  project_id: ObjectId
  template_id: ObjectId
  template_key: string
  created_at: Date
}

export interface Category {
  _id?: ObjectId
  name: string
  templates: AttachedTemplate[]
  created_at: Date
}
