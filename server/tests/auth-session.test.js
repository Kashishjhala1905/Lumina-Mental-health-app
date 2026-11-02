// Sign-in / sign-out lifecycle tests. Boots the real server against a throwaway database
// (lumina_test_<timestamp>_auth) and drives it over HTTP with cookie sessions, like a browser.
// Covers repeated logout/login with the same credentials, accounts created by the original
// (pre-normalisation) code, session termination, data preservation and access control.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const PORT = 6000 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_NAME = `lumina_test_${Date.now()}_auth`;
const MONGO_URI = `${process.env.TEST_MONGO_URL || 'mongodb://localhost:27017'}/${DB_NAME}`;
const PASSWORD = 'Str0ngPassw0rd';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
let serverLog = '';

class Client {
    constructor() { this.cookie = null; }
    async req(method, url, body, headers = {}) {
        const res = await fetch(BASE + url, {
            method,
            headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        for (const c of res.headers.getSetCookie()) {
            const pair = c.split(';')[0];
            const [name, ...rest] = pair.split('=');
            if (name === 'lumina_token') this.cookie = rest.join('=') ? pair : null;
        }
        let data = null;
        try { data = await res.json(); } catch { /* non-JSON */ }
        return { status: res.status, data, headers: res.headers };
    }
    get(u, h) { return this.req('GET', u, undefined, h); }
    post(u, b, h) { return this.req('POST', u, b ?? {}, h); }
}

const users = () => mongoose.connection.collection('users');
const reg = (n) => ({ name: `Cycle Tester ${n}`, username: `cycle_${n}`, email: `cycle.${n}@example.test`, password: PASSWORD, confirmPassword: PASSWORD });
/** Inserts an account exactly as the original (pre-normalisation) code stored it. */
const insertLegacy = async (fields) => {
    const hash = await bcrypt.hash(PASSWORD, 10); // the original code used genSalt(10)
    const { insertedId } = await users().insertOne({ role: 'student', isApproved: true, createdAt: new Date(), updatedAt: new Date(), password: hash, ...fields });
    return insertedId;
};

test.before(async () => {
    server = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: String(PORT),
            MONGO_URI,
            JWT_SECRET: `auth-session-secret-${Date.now()}`,
            DATA_ENCRYPTION_KEY: 'auth-session-encryption-key',
            REMINDERS_ENABLED: 'false',
            GROQ_API_KEY: '',
            EMAIL_PROVIDER: '', SMTP_HOST: '', EMAIL_HOST: '', RESEND_API_KEY: '',
            CLIENT_URL: 'https://lumina-test.example.org',
            APP_BASE_URL: '',
            REGISTER_RATE_LIMIT: '1000',
            API_RATE_LIMIT: '100000',
            LOGIN_RATE_LIMIT: '1000',
            FORGOT_PASSWORD_RATE_LIMIT: '1000',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', (d) => { serverLog += d; });
    server.stderr.on('data', (d) => { serverLog += d; });
    for (let i = 0; i < 80; i++) {
        try { if ((await (await fetch(`${BASE}/api/health`)).json()).db === 'connected') break; } catch { /* starting */ }
        await sleep(250);
    }
    await mongoose.connect(MONGO_URI);
});

test.after(async () => {
    if (mongoose.connection.readyState === 1) {
        if (/^lumina_test_\d+_auth$/.test(mongoose.connection.db.databaseName)) await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    }
    server?.kill();
});

test('A1. register, then sign out and sign in again with the same credentials five times', async () => {
    const c = new Client();
    const r = await c.post('/api/auth/register', reg('a1'));
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const before = await users().findOne({ username: 'cycle_a1' });
    assert.ok(before, 'account saved in MongoDB');
    const userCount = await users().countDocuments();

    const identifiers = ['cycle.a1@example.test', 'cycle_a1', '  CYCLE.A1@EXAMPLE.TEST ', 'Cycle_A1', 'cycle.a1@example.test'];
    for (const [i, identifier] of identifiers.entries()) {
        const out = await c.post('/api/auth/logout');
        assert.equal(out.status, 200);
        assert.equal(c.cookie, null, `cycle ${i + 1}: cookie cleared`);
        assert.equal((await c.get('/api/auth/me')).status, 401, `cycle ${i + 1}: signed out`);

        const login = await c.post('/api/auth/login', { identifier, password: PASSWORD, rememberMe: i % 2 === 0 });
        assert.equal(login.status, 200, `cycle ${i + 1} (${JSON.stringify(identifier)}): ${JSON.stringify(login.data)}`);
        assert.equal(login.data.user.username, 'cycle_a1');
        assert.equal(login.data.user.role, 'user');
        assert.equal(login.data.user.password, undefined, 'no password hash in the response');
        const me = await c.get('/api/auth/me');
        assert.equal(me.status, 200);
        assert.equal(me.data.data.email, 'cycle.a1@example.test');
    }

    const after = await users().findOne({ _id: before._id });
    assert.equal(after.password, before.password, 'password hash never changes on login/logout');
    assert.equal(after.email, before.email);
    assert.equal(after.username, before.username);
    assert.equal(after.tokenVersion ?? 0, before.tokenVersion ?? 0, 'a normal sign-out does not revoke other devices');
    assert.equal(await users().countDocuments(), userCount, 'login never creates or deletes accounts');
});

test('A2. sign-out terminates the session: the old token is rejected even if replayed', async () => {
    const c = new Client();
    await c.post('/api/auth/login', { identifier: 'cycle_a1', password: PASSWORD });
    const stolen = c.cookie;
    assert.ok(stolen);
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    const replay = await new Client().get('/api/auth/me', { Cookie: stolen });
    assert.equal(replay.status, 401, 'the signed-out token cannot be reused');
    const bearer = await new Client().get('/api/auth/me', { Authorization: `Bearer ${stolen.split('=').slice(1).join('=')}` });
    assert.equal(bearer.status, 401, 'nor as a bearer token');

    // Other sessions of the same user are unaffected by a normal sign-out
    const laptop = new Client();
    const phone = new Client();
    await laptop.post('/api/auth/login', { identifier: 'cycle_a1', password: PASSWORD });
    await phone.post('/api/auth/login', { identifier: 'cycle_a1', password: PASSWORD });
    await laptop.post('/api/auth/logout');
    assert.equal((await phone.get('/api/auth/me')).status, 200, 'the phone stays signed in');
    assert.equal((await laptop.post('/api/auth/login', { identifier: 'cycle_a1', password: PASSWORD })).status, 200, 'and the laptop can sign in again');
});

test('A3. sign-out keeps the account and all user data', async () => {
    const c = new Client();
    await c.post('/api/auth/login', { identifier: 'cycle_a1', password: PASSWORD });
    const uid = (await users().findOne({ username: 'cycle_a1' }))._id;
    assert.equal((await c.post('/api/mood', { mood: 'happy', notes: 'calm' })).status, 201);
    const post = await c.post('/api/community/posts', { title: 'Steady week', content: 'Sharing a steady and calm week with everyone.', identity: 'public' });
    assert.equal(post.status, 201, JSON.stringify(post.data));

    const db = mongoose.connection;
    const snapshot = async () => ({
        user: await users().findOne({ _id: uid }, { projection: { lastLoginAt: 0, updatedAt: 0 } }),
        moods: await db.collection('moodentries').countDocuments({ user: uid }),
        posts: await db.collection('posts').countDocuments({}),
        collections: (await db.db.listCollections().toArray()).map((x) => x.name).sort(),
    });
    const before = await snapshot();
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    assert.deepEqual(await snapshot(), before, 'logout changes nothing in the database except the session');

    await c.post('/api/auth/login', { identifier: 'cycle.a1@example.test', password: PASSWORD });
    assert.equal((await c.get('/api/mood')).data.data.length, 1, 'mood history still visible after signing in again');
});

test('A4. accounts created by the original code (email stored as typed) can sign in', async () => {
    const mixedId = await insertLegacy({ name: 'Mixed Case', email: 'Mixed.Case@Example.COM' });
    const spacedId = await insertLegacy({ name: 'Spaced Email', email: ' spaced.user@example.test ' });

    for (const identifier of ['mixed.case@example.com', 'Mixed.Case@Example.COM', ' MIXED.CASE@EXAMPLE.COM']) {
        const r = await new Client().post('/api/auth/login', { identifier, password: PASSWORD });
        assert.equal(r.status, 200, `${JSON.stringify(identifier)}: ${JSON.stringify(r.data)}`);
        assert.equal(r.data.user.id, String(mixedId));
        assert.equal(r.data.user.role, 'user');
    }
    const spaced = await new Client().post('/api/auth/login', { identifier: 'spaced.user@example.test', password: PASSWORD });
    assert.equal(spaced.status, 200, JSON.stringify(spaced.data));
    assert.equal(spaced.data.user.id, String(spacedId));

    // Repeated sign-out / sign-in keeps working, and nothing about the stored account is rewritten
    const c = new Client();
    for (let i = 0; i < 3; i++) {
        assert.equal((await c.post('/api/auth/login', { identifier: 'mixed.case@example.com', password: PASSWORD })).status, 200);
        assert.equal((await c.get('/api/auth/me')).status, 200);
        assert.equal((await c.post('/api/auth/logout')).status, 200);
    }
    const stored = await users().findOne({ _id: mixedId });
    assert.equal(stored.email, 'Mixed.Case@Example.COM', 'existing account is not rewritten');
    assert.ok(await bcrypt.compare(PASSWORD, stored.password), 'existing password still verifies');

    const wrong = await new Client().post('/api/auth/login', { identifier: 'mixed.case@example.com', password: 'WrongPassw0rd' });
    assert.equal(wrong.status, 401, 'a genuinely wrong password is still rejected');
    assert.equal(wrong.data.message, 'Invalid username/email or password');

    // A regex-looking identifier must not match other accounts
    const pattern = await new Client().post('/api/auth/login', { identifier: '.*@example.com', password: PASSWORD });
    assert.equal(pattern.status, 401);
});

test('A5. an old record that fails today\'s stricter schema rules can still sign in', async () => {
    await insertLegacy({ name: 'N'.repeat(120), email: 'long.name@example.test' });
    const r = await new Client().post('/api/auth/login', { identifier: 'long.name@example.test', password: PASSWORD });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const stored = await users().findOne({ email: 'long.name@example.test' });
    assert.ok(stored.lastLoginAt instanceof Date, 'last login is recorded');
    assert.equal(stored.name.length, 120, 'record is otherwise untouched');
});

test('A6. registration and password reset treat email addresses case-insensitively', async () => {
    const dup = await new Client().post('/api/auth/register', { ...reg('a6'), email: 'mixed.case@example.com' });
    assert.equal(dup.status, 409, 'cannot register a second account for an existing (differently-cased) email');
    assert.equal(dup.data.errors.email, 'An account with this email already exists');

    const legacy = await users().findOne({ email: 'Mixed.Case@Example.COM' });
    assert.equal((await new Client().post('/api/auth/forgot-password', { email: 'mixed.case@example.com' })).status, 200);
    let token;
    for (let i = 0; i < 40 && !token; i++) {
        token = await mongoose.connection.collection('passwordresettokens').findOne({ userId: legacy._id });
        if (!token) await sleep(100);
    }
    assert.ok(token, 'a reset link is issued for the existing account');
});

test('A7. authenticated API responses are never cached by the browser', async () => {
    const c = new Client();
    const login = await c.post('/api/auth/login', { identifier: 'cycle_a1', password: PASSWORD });
    assert.match(login.headers.get('cache-control') || '', /no-store/);
    const me = await c.get('/api/auth/me');
    assert.match(me.headers.get('cache-control') || '', /no-store/);
    const mood = await c.get('/api/mood');
    assert.match(mood.headers.get('cache-control') || '', /no-store/);
});

test('A8. users cannot read each other\'s data; member, counselor and admin APIs are role-restricted', async () => {
    const a = new Client();
    const b = new Client();
    await a.post('/api/auth/login', { identifier: 'cycle_a1', password: PASSWORD });
    assert.equal((await b.post('/api/auth/register', reg('a8'))).status, 201);
    assert.equal((await b.get('/api/mood')).data.data.length, 0, 'B does not see A\'s mood entries');
    const aMood = (await a.get('/api/mood')).data.data[0];
    const steal = await b.req('PUT', `/api/mood/${aMood._id}`, { mood: 'sad' });
    assert.ok([403, 404].includes(steal.status), `B cannot edit A's entry (got ${steal.status})`);

    const anon = new Client();
    for (const url of ['/api/auth/me', '/api/mood', '/api/history/summary', '/api/admin/analytics', '/api/counselor/dashboard']) {
        assert.equal((await anon.get(url)).status, 401, `anonymous ${url}`);
    }
    for (const url of ['/api/admin/analytics', '/api/admin/users', '/api/counselor/dashboard', '/api/counselor/cases']) {
        assert.equal((await b.get(url)).status, 403, `member ${url}`);
    }

    // Admin and counselor accounts only come from a trusted process (here: direct DB insert)
    const hash = await bcrypt.hash(PASSWORD, 12);
    await users().insertMany([
        { name: 'Auth Admin', username: 'auth_admin', email: 'auth.admin@example.test', password: hash, role: 'admin', isApproved: true, tokenVersion: 0, counselorApplication: { status: 'none' }, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Auth Counselor', username: 'auth_counselor', email: 'auth.counselor@example.test', password: hash, role: 'counselor', isApproved: true, tokenVersion: 0, counselorApplication: { status: 'none' }, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const admin = new Client();
    const counselor = new Client();
    for (let i = 0; i < 2; i++) {
        assert.equal((await admin.post('/api/auth/login', { identifier: 'auth_admin', password: PASSWORD })).data.user.role, 'admin');
        assert.equal((await counselor.post('/api/auth/login', { identifier: 'AUTH.COUNSELOR@example.test', password: PASSWORD })).data.user.role, 'counselor');
        assert.equal((await admin.get('/api/admin/analytics')).status, 200);
        assert.equal((await counselor.get('/api/counselor/dashboard')).status, 200);
        assert.equal((await counselor.get('/api/admin/analytics')).status, 403, 'counselor cannot use admin APIs');
        assert.equal((await admin.post('/api/auth/logout')).status, 200);
        assert.equal((await counselor.post('/api/auth/logout')).status, 200);
        assert.equal((await admin.get('/api/admin/analytics')).status, 401, 'admin API closed after sign-out');
        assert.equal((await counselor.get('/api/counselor/dashboard')).status, 401, 'counselor API closed after sign-out');
    }
});

test('server log has no errors', () => {
    assert.ok(!/Unhandled|TypeError|ReferenceError|ValidationError/.test(serverLog), serverLog.slice(-2000));
});
