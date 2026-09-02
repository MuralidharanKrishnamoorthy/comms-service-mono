import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { connectDb } from './db.js'
import { projectsRoute } from './routes/projects.js'
import { templatesRoute } from './routes/templates.js'
import { categoriesRoute } from './routes/categories.js'
import { messageLogsRoute } from './routes/messageLogs.js'
import { sendRoute } from './routes/send.js'
import { webhooksRoute } from './routes/webhooks.js'
import { startRetrySweep } from './jobs/retrySweep.js'

const app = new Hono()

app.use('*', cors())

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.route('/projects', projectsRoute)
app.route('/v1/notifications/send', sendRoute)
app.route('/v1/webhooks', webhooksRoute)
app.route('/projects/:projectId/templates', templatesRoute)
app.route('/categories', categoriesRoute)
app.route('/projects/:projectId/logs', messageLogsRoute)

async function main() {
  await connectDb()
  startRetrySweep()

  serve({
    fetch: app.fetch,
    port: 3000
  }, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
