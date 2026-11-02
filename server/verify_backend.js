// Quick smoke check against a RUNNING backend (the full suite is `npm test`).
// Usage: node verify_backend.js [baseUrl]   e.g. node verify_backend.js http://localhost:5003
const BASE = (process.argv[2] || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');

(async () => {
    let cookie = '';
    const call = async (method, path, body) => {
        const res = await fetch(BASE + path, {
            method,
            headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        const set = res.headers.getSetCookie().find((c) => c.startsWith('lumina_token='));
        if (set) cookie = set.split(';')[0];
        return { status: res.status, data: await res.json().catch(() => null) };
    };
    const check = (label, ok) => { console.log(`${ok ? '✅' : '❌'} ${label}`); if (!ok) process.exitCode = 1; };

    console.log(`--- Smoke check: ${BASE} ---`);
    const health = await call('GET', '/api/health');
    check(`Health (db: ${health.data?.db})`, health.status === 200);
    const id = `smoke_${Date.now().toString(36)}`;
    const pw = 'SmokeTest123';
    check('Register', (await call('POST', '/api/auth/register', { name: 'Smoke Test', username: id, email: `${id}@example.test`, password: pw, confirmPassword: pw })).status === 201);
    cookie = '';
    check('Login with username', (await call('POST', '/api/auth/login', { identifier: id, password: pw })).status === 200);
    check('Current user', (await call('GET', '/api/auth/me')).data?.data?.username === id);
    check('Admin API forbidden for users', (await call('GET', '/api/admin/users')).status === 403);
    check('Victim support consent status', (await call('GET', '/api/victim-support/consent')).status === 200);
    check('Logout', (await call('POST', '/api/auth/logout', {})).status === 200);
    check('Session cleared', (await call('GET', '/api/auth/me')).status === 401);
})().catch((e) => { console.error('Smoke check failed:', e.message); process.exit(1); });
