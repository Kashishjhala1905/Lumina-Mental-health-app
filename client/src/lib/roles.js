// Role helpers shared across the client. `student` is the legacy name of the `user` role.
export const normalizeRole = (role) => (role === 'student' ? 'user' : role);

export const ROLE_HOME = {
    user: '/dashboard',
    counselor: '/counselor-dashboard',
    admin: '/admin',
};

export const homeFor = (user) => ROLE_HOME[normalizeRole(user?.role)] || '/';

// Pages reserved for one role (everything else is public or open to any signed-in user)
const ROLE_ONLY_PATHS = [
    ['/admin', ['admin']],
    ['/counselor', ['counselor']], // /counselor-dashboard and /counselor/cases/...
    ['/dashboard', ['user']],
    ['/victim-support/', ['user']], // consent, check-in and dashboard (the landing page is public)
];

/**
 * Where to go after signing in: the page the person originally asked for when their role may
 * open it, otherwise their own dashboard.
 */
export const redirectAfterLogin = (from, user) => {
    if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return homeFor(user);
    if (['/login', '/register', '/forgot-password', '/reset-password'].includes(from.split('?')[0])) return homeFor(user);
    const rule = ROLE_ONLY_PATHS.find(([prefix]) => from === prefix || from.startsWith(prefix));
    if (rule && !rule[1].includes(normalizeRole(user?.role))) return homeFor(user);
    return from;
};

export const ROLE_LABEL = {
    user: 'Member',
    counselor: 'Counselor',
    admin: 'Administrator',
};
