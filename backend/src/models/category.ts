import { z } from 'zod'
import type { ObjectId } from 'mongodb'

export const createCategorySchema = z.object({
  name: z.string().min(1).max(60),
})

// Global — shared across every project, not scoped to one. A template from
// any project can be attached to any category.
export interface Category {
  _id?: ObjectId
  name: string
  created_at: Date
}

// Join collection — a template can belong to any number of categories and a
// category can hold any number of templates. Keyed by template_key (not
// template _id) to match how the rest of the API already addresses templates.
export interface TemplateCategoryLink {
  _id?: ObjectId
  project_id: ObjectId
  category_id: ObjectId
  template_key: string
  created_at: Date
}
