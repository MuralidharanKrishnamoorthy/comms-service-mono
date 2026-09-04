import { z } from 'zod'
import type { ObjectId } from 'mongodb'

export const createCategorySchema = z.object({
  name: z.string().min(1).max(60),
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
