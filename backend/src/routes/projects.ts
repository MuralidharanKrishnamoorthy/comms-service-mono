import { Hono } from 'hono'
import { getDb } from '../db.js'
import { generateApiKey } from '../lib/apiKey.js'
import { createProjectSchema, type Project } from '../models/project.js'

export const projectsRoute = new Hono()

// Create a project — returns the plaintext API key once. It is never retrievable again.
projectsRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createProjectSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const { plaintext, prefix, hash } = generateApiKey()

  const project: Project = {
    name: parsed.data.name,
    api_key_hash: hash,
    api_key_prefix: prefix,
    channels_allowed: ['email', 'sms', 'push'],
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
  }

  const db = getDb()
  const result = await db.collection<Project>('projects').insertOne(project)

  return c.json(
    {
      id: result.insertedId,
      name: project.name,
      api_key: plaintext, // shown once — copy this into the consuming app's .env now
    },
    201
  )
})

// List projects — for the dashboard. Never returns the key, only the prefix.
projectsRoute.get('/', async (c) => {
  const db = getDb()
  const projects = await db
    .collection<Project>('projects')
    .find({}, { projection: { api_key_hash: 0 } })
    .toArray()

  return c.json(projects)
})
