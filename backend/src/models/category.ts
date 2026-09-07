import { z } from 'zod'
import type { ObjectId } from 'mongodb'

const objectIdString = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id')

// `templates` lets a category be created with its first attachments in one
// request — the create-category modal collects both. Optional: a category can
// still be created empty and filled in later from its detail screen. Templates
// are named the way the rest of the API names them, by (project_id,
// template_key); the route resolves each to a template_id before storing.
export const createCategorySchema = z.object({
  name: z.string().min(1).max(60),
  templates: z
    .array(
      z.object({
        project_id: objectIdString,
        template_key: z.string().min(1).max(80),
      })
    )
    .max(200, 'Too many templates in one request')
    .optional(),
})

// One edit covers both the name and the full set of attachments, so the edit
// dialog can save everything in a single request. `templates`, when present,
// REPLACES the whole attachment list — the caller sends the complete set it
// wants, which is what makes unchecking a box a removal.
export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    templates: z
      .array(
        z.object({
          project_id: objectIdString,
          template_key: z.string().min(1).max(80),
        })
      )
      .max(200, 'Too many templates in one request')
      .optional(),
  })
  .refine((v) => v.name !== undefined || v.templates !== undefined, {
    message: 'Provide a name, templates, or both',
  })

// A template attached to a category. template_key is kept alongside
// template_id because every other template route addresses templates by key,
// not id — but template_id is the real foreign key, and is what lets a
// template delete cascade-clean its category attachments (see templatesRoute
// DELETE) even though it looks it up by key elsewhere.
export interface AttachedTemplate {
  project_id: ObjectId
  template_id: ObjectId
  template_key: string
  created_at: Date
}

// Global — shared across every project, not scoped to one. A template from
// any project can be attached to any category. No separate join collection —
// attachments live directly on the category document.
export interface Category {
  _id?: ObjectId
  name: string
  templates: AttachedTemplate[]
  created_at: Date
}
