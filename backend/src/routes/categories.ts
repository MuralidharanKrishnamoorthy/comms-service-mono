import { Hono } from 'hono'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import type { Template } from '../models/template.js'

// Mounted at /projects/:projectId/categories — for the dashboard's category/module dropdown.
// Categories are just a field on templates, not their own collection, so this
// derives the distinct list from existing templates.
export const categoriesRoute = new Hono()

categoriesRoute.get('/', async (c) => {
  const projectId = c.req.param('projectId')
  if (!projectId || !ObjectId.isValid(projectId)) {
    return c.json({ error: 'Invalid projectId' }, 400)
  }

  const db = getDb()
  const categories = await db
    .collection<Template>('templates')
    .distinct('category', { project_id: new ObjectId(projectId) })

  return c.json(categories)
})
