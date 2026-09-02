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
import { authRoute } from './routes/auth.js'
import { usersRoute } from './routes/users.js'
import { membersRoute } from './routes/members.js'
import { dashboardAuth } from './middleware/dashboardAuth.js'
import { seedAdmin } from './lib/seedAdmin.js'
import { startRetrySweep } from './jobs/retrySweep.js'

const app = new Hono()

// Credentials must be allowed for the httpOnly session cookie, which means the
// echoed origin cannot be "*". Echo the request origin (fine for an internal
// tool; restrict to an allowlist in production).
app.use(
  '*',
  cors({
    origin: (origin) => origin ?? '*',
    credentials: true,
  })
)

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

// ---- Public / independently-authenticated routes (NO dashboardAuth) ----
app.route('/auth', authRoute) // login / logout / me
app.route('/v1/notifications/send', sendRoute) // Bearer <api_key> — consuming apps
app.route('/v1/webhooks', webhooksRoute)

// ---- Dashboard routes: require a logged-in user ----
// Registered before the route handlers so the middleware runs first.
app.use('/projects', dashboardAuth)
app.use('/projects/*', dashboardAuth)
app.use('/categories', dashboardAuth)
app.use('/categories/*', dashboardAuth)
// (/users and /projects/:id/members apply dashboardAuth + requireAdmin internally)

app.route('/projects/:projectId/members', membersRoute)
app.route('/projects', projectsRoute)
app.route('/projects/:projectId/templates', templatesRoute)
app.route('/categories', categoriesRoute)
app.route('/projects/:projectId/logs', messageLogsRoute)
app.route('/users', usersRoute)

async function main() {
  await connectDb()
  await seedAdmin()
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
