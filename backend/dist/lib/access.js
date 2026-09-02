import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
const isAdmin = (user) => user.role === 'admin';
/**
 * Project ids this user may access. `null` means UNRESTRICTED (admin) — callers
 * should skip filtering entirely. Otherwise the exact set from the user's
 * project_members rows.
 */
export async function allowedProjectIds(user) {
    if (isAdmin(user))
        return null;
    const rows = await getDb()
        .collection('project_members')
        .find({ user_id: user._id }, { projection: { project_id: 1 } })
        .toArray();
    return rows.map((r) => r.project_id);
}
/**
 * Whether the user may touch a specific project. Admins always may; everyone
 * else needs a membership row. `projectId` must already be a valid ObjectId string.
 */
export async function hasProjectAccess(user, projectId) {
    if (isAdmin(user))
        return true;
    const row = await getDb()
        .collection('project_members')
        .findOne({ user_id: user._id, project_id: new ObjectId(projectId) });
    return row !== null;
}
