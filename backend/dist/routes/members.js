import { Hono } from 'hono';
import { ObjectId, MongoServerError } from 'mongodb';
import { getDb } from '../db.js';
import { dashboardAuth, requireAdmin } from '../middleware/dashboardAuth.js';
// Mounted at /projects/:projectId/members — admin-only management of who can
// access a single project. (User-centric membership editing also happens via
// PATCH /users/:id with project_ids; this is the project-centric view.)
export const membersRoute = new Hono();
membersRoute.use('*', dashboardAuth);
membersRoute.use('*', requireAdmin);
// GET /projects/:projectId/members — users who can access this project.
membersRoute.get('/', async (c) => {
    const projectId = c.req.param('projectId');
    if (!projectId || !ObjectId.isValid(projectId))
        return c.json({ error: 'Invalid projectId' }, 400);
    const db = getDb();
    const links = await db
        .collection('project_members')
        .find({ project_id: new ObjectId(projectId) })
        .toArray();
    const userIds = links.map((l) => l.user_id);
    const users = await db
        .collection('users')
        .find({ _id: { $in: userIds } })
        .toArray();
    return c.json(users.map((u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role, status: u.status })));
});
// POST /projects/:projectId/members  { user_id }
membersRoute.post('/', async (c) => {
    const projectId = c.req.param('projectId');
    if (!projectId || !ObjectId.isValid(projectId))
        return c.json({ error: 'Invalid projectId' }, 400);
    const body = await c.req.json().catch(() => null);
    const userId = body?.user_id;
    if (typeof userId !== 'string' || !ObjectId.isValid(userId)) {
        return c.json({ error: 'A valid user_id is required' }, 400);
    }
    const db = getDb();
    const [project, user] = await Promise.all([
        db.collection('projects').findOne({ _id: new ObjectId(projectId) }),
        db.collection('users').findOne({ _id: new ObjectId(userId) }),
    ]);
    if (!project)
        return c.json({ error: 'Project not found' }, 404);
    if (!user)
        return c.json({ error: 'User not found' }, 404);
    if (user.role === 'admin') {
        return c.json({ error: 'Admins already have access to every project' }, 400);
    }
    const link = {
        user_id: new ObjectId(userId),
        project_id: new ObjectId(projectId),
        role_in_project: 'editor',
        created_at: new Date(),
    };
    try {
        await db.collection('project_members').insertOne(link);
    }
    catch (err) {
        // Already a member — idempotent success.
        if (!(err instanceof MongoServerError && err.code === 11000))
            throw err;
    }
    return c.json({ added: true }, 201);
});
// DELETE /projects/:projectId/members/:userId
membersRoute.delete('/:userId', async (c) => {
    const projectId = c.req.param('projectId');
    const userId = c.req.param('userId');
    if (!projectId || !ObjectId.isValid(projectId))
        return c.json({ error: 'Invalid projectId' }, 400);
    if (!userId || !ObjectId.isValid(userId))
        return c.json({ error: 'Invalid userId' }, 400);
    await getDb()
        .collection('project_members')
        .deleteOne({ project_id: new ObjectId(projectId), user_id: new ObjectId(userId) });
    return c.json({ removed: true });
});
