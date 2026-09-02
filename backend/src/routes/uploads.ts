import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads')

const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

// Mounted at /uploads. Images inserted into an email template's body are
// uploaded here as real files and referenced by URL — inline base64 data
// URIs bloat the stored template and get stripped by several email clients,
// so a hosted URL is the only approach that actually works for real email.
export const uploadsRoute = new Hono()

uploadsRoute.post('/', async (c) => {
  const body = await c.req.parseBody().catch(() => null)
  const file = body?.file
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided (expected multipart field "file")' }, 400)
  }

  const ext = ALLOWED_TYPES[file.type]
  if (!ext) {
    return c.json({ error: `Unsupported file type "${file.type}". Allowed: PNG, JPEG, GIF, WEBP, SVG.` }, 400)
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: `File too large (${Math.round(file.size / 1024)}KB) — 5MB max.` }, 400)
  }

  await mkdir(UPLOADS_DIR, { recursive: true })
  const filename = `${randomUUID()}${ext}`
  const bytes = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(UPLOADS_DIR, filename), bytes)

  return c.json({ url: `/uploads/${filename}` }, 201)
})
