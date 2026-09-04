import { createMiddleware } from 'hono/factory'
import { getDb } from '../db.js'
import { hashApiKey } from '../lib/apiKey.js'
import type { ApiKey } from '../models/apiKey.js'
import type { Project } from '../models/project.js'

/**
 * Verifies the "Authorization: Bearer <api_key>" header for the send API.
 *
 * Multi-key aware: the presented token is hashed and looked up in the api_keys
 * collection (one project can now have many independently-owned keys). The key
 * must be active, and its project must be active. The matched project is
 * attached as c.get('project') for downstream handlers — unchanged in spirit
 * from the old single-key design. This path uses key_hash only; it never
 * touches the reversible value_encrypted store.
 */
export const authMiddleware = createMiddleware<{
  Variables: { project: Project }
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or malformed Authorization header' }, 401)
  }

  const key = authHeader.slice('Bearer '.length).trim()
  const hash = hashApiKey(key)

  const db = getDb()
  const apiKey = await db.collection<ApiKey>('api_keys').findOne({ key_hash: hash })

  if (!apiKey) {
    return c.json({ error: 'Invalid API key' }, 401)
  }
  // Revoked keys fail immediately — status is checked, not just the hash match.
  if (apiKey.status !== 'active') {
    return c.json({ error: 'API key has been revoked' }, 401)
  }

  const project = await db.collection<Project>('projects').findOne({ _id: apiKey.project_id })
  if (!project) {
    return c.json({ error: 'Invalid API key' }, 401)
  }
  if (project.status !== 'active') {
    return c.json({ error: 'Project is disabled' }, 403)
  }

  c.set('project', project)
  await next()
})
