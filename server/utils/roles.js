// Role helpers. `student` is the legacy name of the default role and is treated exactly like `user`.
const ROLES = Object.freeze({ USER: 'user', COUNSELOR: 'counselor', ADMIN: 'admin' });
const LEGACY_USER_ROLES = ['student'];
const ALL_ROLES = ['user', 'student', 'counselor', 'admin'];

const normalizeRole = (role) => (LEGACY_USER_ROLES.includes(role) ? ROLES.USER : role);

/** Expands `user` to also match legacy `student` accounts. */
const expandRoles = (roles) => {
    const expanded = new Set(roles);
    if (expanded.has(ROLES.USER)) LEGACY_USER_ROLES.forEach((r) => expanded.add(r));
    return [...expanded];
};

module.exports = { ROLES, ALL_ROLES, LEGACY_USER_ROLES, normalizeRole, expandRoles };
