import { ObjectId } from 'mongodb';
const isAdmin = (user) => user.role === 'admin';
export function allowedProjectIds(user) {
    if (isAdmin(user))
        return null;
    return user.project_ids;
}
export function hasProjectAccess(user, projectId) {
    if (isAdmin(user))
        return true;
    return user.project_ids.some((id) => id.equals(projectId));
}
