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
