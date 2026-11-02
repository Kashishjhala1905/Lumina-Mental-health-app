// End-to-end tests for: password reset, email delivery (SMTP + Resend API behaviour), reminders,
// notification emails and referral management. Uses a throwaway database and LOCAL provider stand-ins
// (tests/helpers/testMailServers.js) – no real email is sent and nothing leaves the machine.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { createSmtpSink, createMockResend } = require('./helpers/testMailServers');

const PORT = 6100 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_NAME = `lumina_test_${Date.now()}_mail`;
const MONGO_URI = `${process.env.TEST_MONGO_URL || 'mongodb://localhost:27017'}/${DB_NAME}`;
const PASSWORD = 'Str0ngPassw0rd';
const WEBHOOK_SECRET = `whsec_${Buffer.from('lumina-test-webhook-secret-32bytes!').toString('base64')}`;
const ACKS = { dataCollection: true, dataUsage: true, authorizedAccess: true, notEmergencyService: true, prototypeNotice: true };

let server;
let smtp;
let resendMock;
let serverLog = '';

class Client {
    constructor() { this.cookie = null; }
    async req(method, url, body, headers = {}) {
        const res = await fetch(BASE + url, {
            method,
            headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
            body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
        });
        for (const c of (res.headers.getSetCookie?.() || [])) {
            const pair = c.split(';')[0];
            const [name, ...rest] = pair.split('=');
            if (name === 'lumina_token') this.cookie = rest.join('=') ? pair : null;
        }
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch { /* not json */ }
        return { status: res.status, data, text };
    }
    get(u, h) { return this.req('GET', u, undefined, h); }
    post(u, b, h) { return this.req('POST', u, b ?? {}, h); }
    patch(u, b, h) { return this.req('PATCH', u, b ?? {}, h); }
    put(u, b, h) { return this.req('PUT', u, b ?? {}, h); }
    del(u, b, h) { return this.req('DELETE', u, b ?? {}, h); }
}

const reg = (n, extra = {}) => ({ name: `Mail Tester ${n}`, username: `mail_${n}`, email: `mail.${n}@example.test`, password: PASSWORD, confirmPassword: PASSWORD, ...extra });
const tokenFrom = (msg) => (msg?.text.match(/reset-password\?token=([A-Za-z0-9_-]{43})/) || [])[1];
const col = (name) => mongoose.connection.collection(name);
const userId = async (username) => (await col('users').findOne({ username }))._id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const s = { user: new Client(), user2: new Client(), admin: new Client(), counselor: new Client(), counselor2: new Client(), anon: new Client() };

test.before(async () => {
    smtp = await createSmtpSink();
    resendMock = await createMockResend();
    server = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: String(PORT),
            MONGO_URI,
            JWT_SECRET: `mail-test-secret-${Date.now()}`,
            DATA_ENCRYPTION_KEY: 'mail-test-encryption-key',
            REMINDERS_ENABLED: 'false',
            GROQ_API_KEY: '',
            // Configured exactly like the documented .env: EMAIL_* names, provider inferred from EMAIL_HOST
            EMAIL_PROVIDER: '',
            SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASS: '', SMTP_SECURE: '',
            EMAIL_HOST: '127.0.0.1',
            EMAIL_PORT: String(smtp.port),
            EMAIL_SECURE: 'false',
            EMAIL_IGNORE_TLS: 'true',
            EMAIL_USER: 'lumina-test',
            EMAIL_PASSWORD: 'lumina-test-password',
            EMAIL_FROM: 'Lumina <no-reply@lumina.test>',
            EMAIL_TIMEOUT_MS: '3000',
            RESEND_API_KEY: '',
            RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET,
            APP_BASE_URL: '',
            CLIENT_URL: 'https://lumina-test.example.org',
            REGISTER_RATE_LIMIT: '1000',
            API_RATE_LIMIT: '100000',
            CHECKIN_RATE_LIMIT: '1000',
            FORGOT_PASSWORD_RATE_LIMIT: '9',
            RESET_PASSWORD_RATE_LIMIT: '1000',
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

    // Trusted admin (seed-style), two approved counselors, one user
    await col('users').insertOne({ name: 'Mail Admin', username: 'mail_admin', email: 'admin@example.test', password: await bcrypt.hash(PASSWORD, 12), role: 'admin', isApproved: true, tokenVersion: 0, counselorApplication: { status: 'none' }, createdAt: new Date(), updatedAt: new Date() });
    await s.admin.post('/api/auth/login', { identifier: 'mail_admin', password: PASSWORD });
    for (const [client, n] of [[s.counselor, 'coun1'], [s.counselor2, 'coun2']]) {
        await client.post('/api/auth/register', reg(n, { applyAsCounselor: true, speciality: 'Trauma', credentials: 'LIC' }));
        const pending = await s.admin.get('/api/admin/pending-counselors');
        await s.admin.patch(`/api/admin/approve-counselor/${pending.data.data.find((p) => p.username === `mail_${n}`)._id}`);
    }
    await s.user.post('/api/auth/register', reg('alice'));
});

test.after(async () => {
    if (mongoose.connection.readyState === 1) {
        if (/^lumina_test_\d+_mail$/.test(mongoose.connection.db.databaseName)) await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    }
    server?.kill();
    await smtp?.close();
    await resendMock?.close();
});

// ============================ PASSWORD RESET ============================

test('R1. forgot password (registered email): neutral response, branded email with single-use link, only the hash stored', async () => {
    const r = await s.anon.post('/api/auth/forgot-password', { email: 'Mail.Alice@example.test' });
    assert.equal(r.status, 200);
    assert.match(r.data.message, /If an account exists/);
    const msg = await smtp.waitFor((m) => m.to.includes('mail.alice@example.test') && /Reset your Lumina password/.test(m.subject));
    assert.ok(msg, 'reset email captured by the SMTP server');
    const token = tokenFrom(msg);
    assert.ok(token, 'reset link contains a token');
    assert.match(msg.text, /https:\/\/lumina-test\.example\.org\/#\/reset-password\?token=/, 'link built from CLIENT_URL');
    assert.match(msg.text, /used only once and expires in 15 minutes/);
    assert.match(msg.text, /Did not request this\?/);
    const logoAsset = path.join(__dirname, '..', 'assets', 'email', 'lumina-logo.png');
    if (require('fs').existsSync(logoAsset)) {
        assert.match(msg.raw, /Content-ID: <lumina-logo>/i, 'logo embedded as inline image');
        assert.match(msg.text, /src="cid:lumina-logo"/, 'template references the inline logo');
    }
    const stored = await col('passwordresettokens').findOne({ userId: await userId('mail_alice') });
    assert.equal(stored.tokenHash, crypto.createHash('sha256').update(token).digest('hex'));
    assert.ok(!JSON.stringify(stored).includes(token), 'raw token never stored');
    assert.ok(stored.expiresAt - Date.now() <= 15 * 60 * 1000 + 5000);
    const delivery = await col('emaildeliveries').findOne({ type: 'password_reset' });
    assert.equal(delivery.status, 'accepted');
    assert.equal(delivery.toMasked, 'm***@example.test');
    assert.ok(!JSON.stringify(delivery).includes('mail.alice@example.test'), 'recipient stored masked/hashed only');
    s.token1 = token;
});

test('R2. forgot password (unregistered email): identical response, nothing sent', async () => {
    const before = smtp.messages.length;
    const known = await s.anon.post('/api/auth/forgot-password', { email: 'mail.alice@example.test' });
    const unknown = await s.anon.post('/api/auth/forgot-password', { email: 'nobody.here@example.test' });
    assert.equal(unknown.status, known.status);
    assert.equal(unknown.text, known.text, 'response bodies are byte-identical (no enumeration)');
    await sleep(1200);
    assert.ok(!smtp.messages.slice(before).some((m) => m.to.includes('nobody.here@example.test')));
    assert.equal(await col('emaildeliveries').countDocuments({ toMasked: 'n***@example.test' }), 0);
    const bad = await s.anon.post('/api/auth/forgot-password', { email: 'not-an-email' });
    assert.equal(bad.status, 400);
    // The second request (above) issued a newer link, which invalidates token1
    const newest = await smtp.waitFor((m) => m.to.includes('mail.alice@example.test') && tokenFrom(m) && tokenFrom(m) !== s.token1);
    s.token2 = tokenFrom(newest);
    assert.equal((await s.anon.post('/api/auth/reset-password/verify', { token: s.token1 })).data.valid, false, 'older link invalidated by a newer one');
});

test('R3. valid token: verification, password validation without burning the token', async () => {
    const v = await s.anon.post('/api/auth/reset-password/verify', { token: s.token2 });
    assert.equal(v.status, 200);
    assert.equal(v.data.valid, true);
    const weak = await s.anon.post('/api/auth/reset-password', { token: s.token2, password: 'weak', confirmPassword: 'weak' });
    assert.equal(weak.status, 400);
    assert.ok(weak.data.errors.password);
    const mismatch = await s.anon.post('/api/auth/reset-password', { token: s.token2, password: 'N3wSecurePass', confirmPassword: 'Different1A' });
    assert.equal(mismatch.status, 400);
    assert.ok(mismatch.data.errors.confirmPassword);
    const same = await s.anon.post('/api/auth/reset-password', { token: s.token2, password: PASSWORD, confirmPassword: PASSWORD });
    assert.equal(same.status, 400, 'cannot reuse the current password');
    assert.equal((await s.anon.post('/api/auth/reset-password/verify', { token: s.token2 })).data.valid, true, 'token still usable');
    assert.equal((await s.anon.post('/api/auth/reset-password', { token: 'x'.repeat(10), password: 'N3wSecurePass', confirmPassword: 'N3wSecurePass' })).status, 400);
});

test('R4. successful reset: password updated, all sessions revoked, login works, security notice sent', async () => {
    const oldSession = s.user.cookie;
    assert.equal((await s.user.get('/api/auth/me')).status, 200);
    const r = await s.anon.post('/api/auth/reset-password', { token: s.token2, password: 'N3wSecurePass', confirmPassword: 'N3wSecurePass' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const doc = await col('users').findOne({ username: 'mail_alice' });
    assert.equal(await bcrypt.compare('N3wSecurePass', doc.password), true);
    const revoked = await new Client().get('/api/auth/me', { Cookie: oldSession });
    assert.equal(revoked.status, 401);
    assert.equal(revoked.data.code, 'TOKEN_REVOKED');
    assert.equal((await new Client().post('/api/auth/login', { identifier: 'mail_alice', password: PASSWORD })).status, 401);
    assert.equal((await s.user.post('/api/auth/login', { identifier: 'mail.alice@example.test', password: 'N3wSecurePass' })).status, 200);
    assert.ok(await smtp.waitFor((m) => m.to.includes('mail.alice@example.test') && /password was changed/i.test(m.subject)));
    const used = await col('passwordresettokens').findOne({ tokenHash: crypto.createHash('sha256').update(s.token2).digest('hex') });
    assert.ok(used.usedAt);
});

test('R5. reusing a used token fails', async () => {
    const r = await s.anon.post('/api/auth/reset-password', { token: s.token2, password: 'An0therPass1', confirmPassword: 'An0therPass1' });
    assert.equal(r.status, 400);
    assert.equal(r.data.code, 'INVALID_TOKEN');
});

test('R6. expired token fails', async () => {
    await s.anon.post('/api/auth/forgot-password', { email: 'mail.alice@example.test' });
    const msg = await smtp.waitFor((m) => m.to.includes('mail.alice@example.test') && tokenFrom(m) && ![s.token1, s.token2].includes(tokenFrom(m)));
    const token = tokenFrom(msg);
    await col('passwordresettokens').updateOne({ tokenHash: crypto.createHash('sha256').update(token).digest('hex') }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await s.anon.post('/api/auth/reset-password/verify', { token })).data.valid, false);
    const r = await s.anon.post('/api/auth/reset-password', { token, password: 'Exp1redPass', confirmPassword: 'Exp1redPass' });
    assert.equal(r.status, 400);
    assert.equal(r.data.code, 'INVALID_TOKEN');
});

test('R7. per-account throttle (silent) and per-IP rate limit', async () => {
    const before = smtp.messages.filter((m) => m.to.includes('mail.alice@example.test')).length;
    const r = await s.anon.post('/api/auth/forgot-password', { email: 'mail.alice@example.test' }); // 4th within an hour
    assert.equal(r.status, 200, 'still a neutral response');
    await sleep(1200);
    assert.equal(smtp.messages.filter((m) => m.to.includes('mail.alice@example.test')).length, before, 'no 4th email');
    assert.ok(await col('auditevents').findOne({ action: 'PASSWORD_RESET_THROTTLED' }));
    let last;
    for (let i = 0; i < 6; i++) last = await s.anon.post('/api/auth/forgot-password', { email: `rate${i}@example.test` });
    assert.equal(last.status, 429);
    assert.ok(!serverLog.includes(s.token1) && !serverLog.includes(s.token2), 'tokens never logged');
    assert.ok(!serverLog.includes('N3wSecurePass'), 'passwords never logged');
});

test('R8. existing registration and login still work', async () => {
    const c = new Client();
    assert.equal((await c.post('/api/auth/register', reg('bob'))).status, 201);
    await c.post('/api/auth/logout');
    assert.equal((await c.post('/api/auth/login', { identifier: 'mail_bob', password: PASSWORD })).status, 200);
    assert.equal((await c.post('/api/auth/login', { identifier: 'mail.bob@example.test', password: PASSWORD })).status, 200);
    assert.equal((await c.get('/api/auth/me')).data.data.username, 'mail_bob');
});

// ============================ EMAIL PROVIDER ============================

test('E1. admin email status, connection verify and test email (provider acceptance reported, not delivery)', async () => {
    assert.equal((await s.user.get('/api/admin/email/status')).status, 403);
    assert.equal((await s.user.post('/api/admin/email/test', {})).status, 403);
    const st = await s.admin.get('/api/admin/email/status');
    assert.equal(st.data.data.provider.provider, 'smtp');
    assert.equal(st.data.data.provider.configured, true);
    assert.equal(st.data.data.provider.deliveryConfirmation, 'acceptance_only');
    assert.ok(!JSON.stringify(st.data).includes('mail.alice@example.test'), 'recipients masked');
    const v = await s.admin.post('/api/admin/email/verify');
    assert.equal(v.status, 200, JSON.stringify(v.data));
    assert.equal(v.data.ok, true);
    const t = await s.admin.post('/api/admin/email/test', { to: 'ops@example.test' });
    assert.equal(t.status, 200, JSON.stringify(t.data));
    assert.equal(t.data.result.status, 'accepted');
    assert.match(t.data.message, /not proof of delivery/);
    assert.ok(await smtp.waitFor((m) => m.to.includes('ops@example.test') && m.subject === 'Lumina email test'));
});

test('E2. SMTP authentication failure is reported, not retried, nothing sent', async () => {
    smtp.setMode('auth_fail');
    const before = smtp.messages.length;
    const t = await s.admin.post('/api/admin/email/test', { to: 'ops@example.test' });
    smtp.setMode('ok');
    assert.equal(t.status, 502);
    assert.equal(t.data.result.status, 'failed');
    assert.equal(t.data.result.errorCode, 'auth');
    assert.equal(smtp.messages.length, before);
    const rec = await col('emaildeliveries').findOne({ _id: new mongoose.Types.ObjectId(t.data.result.deliveryId) });
    assert.equal(rec.attempts, 1, 'auth errors are not retried');
    assert.equal(rec.status, 'failed');
});

test('E3. temporary SMTP failure is retried once and sent exactly once', async () => {
    smtp.setMode('tempfail_once');
    const before = smtp.messages.length;
    const t = await s.admin.post('/api/admin/email/test', { to: 'retry@example.test' });
    smtp.setMode('ok');
    assert.equal(t.data.result.status, 'accepted', JSON.stringify(t.data));
    const rec = await col('emaildeliveries').findOne({ _id: new mongoose.Types.ObjectId(t.data.result.deliveryId) });
    assert.equal(rec.attempts, 2);
    assert.equal(smtp.messages.slice(before).filter((m) => m.to.includes('retry@example.test')).length, 1, 'no duplicate');
});

test('E4. Resend API behaviour: idempotency key, safe retries, auth errors, timeouts (local mock, in-process)', async () => {
    const env = { ...process.env };
    Object.assign(process.env, { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test_key', RESEND_API_URL: resendMock.url, EMAIL_FROM: 'Lumina <no-reply@lumina.test>', EMAIL_TIMEOUT_MS: '400', NODE_ENV: 'test' });
    const { sendEmail } = require('../services/email/emailService');
    try {
        resendMock.reset([{ status: 429, body: { name: 'rate_limit_exceeded' } }, { status: 200, body: { id: 're_abc' } }]);
        const ok = await sendEmail({ to: 'x@example.test', type: 'test', idempotencyKey: 'unit:resend:1', data: { sentAt: 'now', provider: 'resend' } });
        assert.equal(ok.status, 'accepted');
        assert.equal(ok.providerMessageId, 're_abc');
        assert.equal(resendMock.requests.length, 2);
        assert.equal(resendMock.requests[0].headers['idempotency-key'], 'unit:resend:1');
        assert.equal(resendMock.requests[1].headers['idempotency-key'], 'unit:resend:1', 'retry reuses the same key');
        assert.equal(resendMock.requests[0].headers.authorization, 'Bearer re_test_key');

        const dup = await sendEmail({ to: 'x@example.test', type: 'test', idempotencyKey: 'unit:resend:1', data: {} });
        assert.equal(dup.status, 'duplicate');
        assert.equal(resendMock.requests.length, 2, 'an accepted email is never sent twice');

        resendMock.reset([{ status: 401, body: { name: 'invalid_api_Key' } }]);
        const auth = await sendEmail({ to: 'x@example.test', type: 'test', idempotencyKey: 'unit:resend:2', data: {} });
        assert.equal(auth.status, 'failed');
        assert.equal(auth.errorCode, 'auth');
        assert.equal(resendMock.requests.length, 1);

        resendMock.reset([{ status: 200, delayMs: 1500, body: { id: 'late' } }, { status: 200, body: { id: 're_after_timeout' } }]);
        const slow = await sendEmail({ to: 'x@example.test', type: 'test', idempotencyKey: 'unit:resend:3', data: {} });
        assert.equal(slow.status, 'accepted');
        assert.equal(resendMock.requests.length, 2);
        assert.equal(resendMock.requests[1].headers['idempotency-key'], 'unit:resend:3', 'timeout retry is idempotent');

        resendMock.reset([{ status: 500 }, { status: 502 }, { status: 503 }]);
        const down = await sendEmail({ to: 'x@example.test', type: 'test', idempotencyKey: 'unit:resend:4', data: {} });
        assert.equal(down.status, 'failed');
        assert.equal(down.errorCode, 'provider_error');
        assert.equal(resendMock.requests.length, 3);
    } finally {
        for (const k of ['EMAIL_PROVIDER', 'RESEND_API_KEY', 'RESEND_API_URL', 'EMAIL_FROM', 'EMAIL_TIMEOUT_MS']) {
            if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k];
        }
    }
});

test('E5. delivery is only confirmed by a correctly signed provider webhook', async () => {
    const del = await col('emaildeliveries').insertOne({ type: 'test', status: 'accepted', provider: 'resend', providerMessageId: 'msg_webhook_1', attempts: 1, events: [], createdAt: new Date(), updatedAt: new Date() });
    const body = JSON.stringify({ type: 'email.delivered', created_at: new Date().toISOString(), data: { email_id: 'msg_webhook_1' } });
    const sign = (id, ts, raw) => `v1,${crypto.createHmac('sha256', Buffer.from(WEBHOOK_SECRET.slice(6), 'base64')).update(`${id}.${ts}.${raw}`).digest('base64')}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const bad = await s.anon.post('/api/email/webhooks/resend', body, { 'svix-id': 'evt_1', 'svix-timestamp': ts, 'svix-signature': 'v1,invalidsignature' });
    assert.equal(bad.status, 401);
    const stale = String(Math.floor(Date.now() / 1000) - 3600);
    assert.equal((await s.anon.post('/api/email/webhooks/resend', body, { 'svix-id': 'evt_1', 'svix-timestamp': stale, 'svix-signature': sign('evt_1', stale, body) })).status, 401);
    assert.equal((await col('emaildeliveries').findOne({ _id: del.insertedId })).status, 'accepted');
    const ok = await s.anon.post('/api/email/webhooks/resend', body, { 'svix-id': 'evt_1', 'svix-timestamp': ts, 'svix-signature': sign('evt_1', ts, body) });
    assert.equal(ok.status, 200, ok.text);
    const rec = await col('emaildeliveries').findOne({ _id: del.insertedId });
    assert.equal(rec.status, 'delivered');
    assert.ok(rec.deliveredAt);
});

// ============================ REMINDERS ============================

test('M1. enrolling with reminders creates a scheduled reminder in the user timezone', async () => {
    const r = await s.user.post('/api/victim-support/consent', { acknowledgements: ACKS, enableReminders: true, timezone: 'Asia/Kolkata' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    s.caseRef = r.data.data.consent.caseRef;
    const uid = await userId('mail_alice');
    const pref = await col('reminderpreferences').findOne({ userId: uid });
    const ev = await col('reminderevents').findOne({ userId: uid, status: 'scheduled' });
    assert.ok(ev, 'scheduled event exists');
    assert.equal(ev.scheduledFor.toISOString(), pref.nextReminderAt.toISOString());
    const local = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(pref.nextReminderAt);
    assert.equal(local, '10', 'default 10:00 in the user timezone');
    const upd = await s.user.put('/api/victim-support/reminders', { enabled: true, frequency: 'daily', channels: { inApp: true, email: true } });
    assert.equal(upd.status, 200, JSON.stringify(upd.data));
    assert.equal(upd.data.data.channels.email, true);
});

async function makeDue(uid, lastCheckinDaysAgo = 5) {
    await col('reminderpreferences').updateOne({ userId: uid }, { $set: { nextReminderAt: new Date(Date.now() - 60000) } });
    await col('victimsupportconsents').updateOne({ userId: uid }, { $set: { lastCheckinAt: new Date(Date.now() - lastCheckinDaysAgo * 86400000) } });
}

test('M2. due reminder is sent in-app + by email, tracked, and the next one scheduled', async () => {
    const uid = await userId('mail_alice');
    await makeDue(uid);
    const before = smtp.messages.length;
    const run = await s.admin.post('/api/admin/reminders/run');
    assert.equal(run.status, 200);
    assert.equal(run.data.data.sent, 1, JSON.stringify(run.data));
    assert.equal(run.data.data.emailed, 1);
    const sent = await col('reminderevents').findOne({ userId: uid, status: 'sent' });
    assert.equal(sent.channels.inApp.status, 'sent');
    assert.equal(sent.channels.email.status, 'accepted');
    assert.ok(await col('reminderevents').findOne({ userId: uid, status: 'scheduled' }), 'next reminder scheduled');
    const mail = await smtp.waitFor((m, i) => m.to.includes('mail.alice@example.test') && m.subject === 'Lumina: a gentle reminder');
    assert.ok(mail);
    assert.ok(smtp.messages.length > before);
    assert.ok(!/victim|check-in|atrocit/i.test(mail.text), 'reminder email is discreet');
    const mine = await s.user.get('/api/victim-support/reminders');
    assert.ok(mine.data.recent.some((e) => e.status === 'sent' && e.channels.email === 'accepted'));
});

test('M3. duplicate reminders are prevented on the same local day', async () => {
    const uid = await userId('mail_alice');
    const emailsBefore = smtp.messages.filter((m) => m.subject === 'Lumina: a gentle reminder').length;
    await makeDue(uid);
    const run = await s.admin.post('/api/admin/reminders/run');
    assert.equal(run.data.data.sent, 0);
    assert.equal(await col('notifications').countDocuments({ userId: uid, type: 'checkin_reminder' }), 1);
    await sleep(300);
    assert.equal(smtp.messages.filter((m) => m.subject === 'Lumina: a gentle reminder').length, emailsBefore, 'no second email');
    assert.ok(await col('reminderevents').findOne({ userId: uid, status: 'skipped', skipReason: 'duplicate' }));
});

test('M4. a recent check-in suppresses the reminder', async () => {
    const uid = await userId('mail_alice');
    await s.user.post('/api/victim-support/checkins', { emotionalState: 4, stressLevel: 2, anxietyLevel: 2 });
    await col('reminderpreferences').updateOne({ userId: uid }, { $set: { nextReminderAt: new Date(Date.now() - 60000) } });
    const run = await s.admin.post('/api/admin/reminders/run');
    assert.equal(run.data.data.skipped, 1);
    assert.ok(await col('reminderevents').findOne({ userId: uid, status: 'skipped', skipReason: 'recent_checkin' }));
});

test('M5. opting out cancels the scheduled reminder', async () => {
    const uid = await userId('mail_alice');
    const r = await s.user.put('/api/victim-support/reminders', { enabled: false });
    assert.equal(r.status, 200);
    assert.equal(r.data.data.nextReminderAt, null);
    assert.equal(await col('reminderevents').countDocuments({ userId: uid, status: 'scheduled' }), 0);
    assert.ok(await col('reminderevents').findOne({ userId: uid, status: 'skipped', skipReason: 'disabled_by_user' }));
    const run = await s.admin.post('/api/admin/reminders/run');
    assert.equal(run.data.data.due, 0);
});

test('M6. consent withdrawal suppresses reminders even if a stale schedule exists', async () => {
    const uid = await userId('mail_alice');
    assert.equal((await s.user.put('/api/victim-support/reminders', { enabled: true, channels: { email: true } })).status, 200);
    assert.ok(await col('reminderevents').findOne({ userId: uid, status: 'scheduled' }));
    // make a second consented user for later referral tests before withdrawing anything
    await s.user2.post('/api/auth/register', reg('carol'));
    const c2 = await s.user2.post('/api/victim-support/consent', { acknowledgements: ACKS });
    s.caseRef2 = c2.data.data.consent.caseRef;

    const w = await s.user.post('/api/victim-support/consent/withdraw', { dataChoice: 'retain' });
    assert.equal(w.status, 200);
    assert.ok(await col('reminderevents').findOne({ userId: uid, status: 'skipped', skipReason: 'consent_withdrawn' }));
    // Simulate a stale/out-of-band enabled preference: the job must still refuse to send
    await col('reminderpreferences').updateOne({ userId: uid }, { $set: { enabled: true, pausedReason: null, nextReminderAt: new Date(Date.now() - 60000) } });
    const emailsBefore = smtp.messages.length;
    const run = await s.admin.post('/api/admin/reminders/run');
    assert.equal(run.data.data.paused, 1);
    assert.equal(run.data.data.sent, 0);
    await sleep(300);
    assert.equal(smtp.messages.length, emailsBefore);
    assert.equal((await s.user.put('/api/victim-support/reminders', { enabled: true })).status, 400);
});

test('M7. serverless cron endpoint is disabled without CRON_SECRET', async () => {
    assert.equal((await s.anon.get('/api/internal/cron/reminders')).status, 404);
});

// ============================ NOTIFICATION EMAILS ============================

test('N1. opted-in counselor receives a discreet alert email; content stays in the app', async () => {
    const coun2 = await userId('mail_coun2');
    await s.admin.patch(`/api/admin/vs/cases/${s.caseRef2}/assign`, { counselorId: String(await userId('mail_coun1')) });
    assert.equal((await s.counselor.patch('/api/auth/profile', { emailNotifications: true })).status, 200);
    const r = await s.user2.post('/api/victim-support/checkins', { emotionalState: 1, stressLevel: 5, anxietyLevel: 5, safetyConcern: 'unsafe', requestCounselorContact: true, comments: 'private words that must not be emailed' });
    assert.equal(r.status, 201);
    const mail = await smtp.waitFor((m) => m.to.includes('mail.coun1@example.test') && /action needed/.test(m.subject));
    assert.ok(mail, 'counselor alert email');
    assert.match(mail.subject, /AL-[0-9A-Z]{6}/);
    assert.ok(!/private words|unsafe|anxiety/i.test(mail.text), 'no check-in content in email');
    assert.ok(coun2);
});

// ============================ REFERRALS ============================

test('F1. counselor creates a referral from the verified directory (integration clearly not connected)', async () => {
    const dir = await s.counselor.get('/api/counselor/referral-directory');
    assert.equal(dir.status, 200);
    const nalsa = dir.data.data.directory.find((d) => d.id === 'nalsa-15100');
    assert.equal(nalsa.phone, '15100');
    assert.equal(nalsa.integration.available, false);
    assert.equal(nalsa.integration.status, 'not_connected');
    const r = await s.counselor.post(`/api/counselor/cases/${s.caseRef2}/referrals`, {
        category: 'Legal aid information', title: 'Free legal aid consultation', description: 'Information about free legal aid.',
        organization: { directoryId: 'nalsa-15100' }, followUpDate: new Date(Date.now() + 3 * 86400000).toISOString(),
        counselorNote: 'PRIVATE: prefers calls after 5pm', userVisibleUpdate: 'I will share the helpline details at our next call.',
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.match(r.data.data.referralRef, /^RF-[0-9A-Z]{6}$/);
    assert.equal(r.data.data.organization.name, 'NALSA – Free Legal Aid Helpline');
    assert.equal(r.data.data.status, 'Suggested');
    assert.equal(r.data.data.integration.status, 'not_connected');
    s.ref1 = r.data.data;
    const bad = await s.counselor.post(`/api/counselor/cases/${s.caseRef2}/referrals`, { category: 'Not a category', title: 'x' });
    assert.equal(bad.status, 400);
});

test('F2. counselor authorization and user access restrictions', async () => {
    assert.equal((await s.counselor2.post(`/api/counselor/cases/${s.caseRef2}/referrals`, { category: 'Legal aid information', title: 'x' })).status, 403);
    assert.equal((await s.counselor2.patch(`/api/counselor/referrals/${s.ref1._id}`, { status: 'Accepted' })).status, 403);
    assert.equal((await s.counselor2.post(`/api/counselor/referrals/${s.ref1._id}/notes`, { note: 'x' })).status, 403);
    assert.equal((await s.user2.get('/api/counselor/referrals')).status, 403);
    assert.equal((await s.user2.patch(`/api/counselor/referrals/${s.ref1._id}`, { status: 'Completed' })).status, 403);
    assert.equal((await s.admin.get('/api/counselor/referrals')).status, 403);
    assert.equal((await s.anon.get('/api/victim-support/referrals')).status, 401);
    const other = await s.user.patch(`/api/victim-support/referrals/${s.ref1.referralRef}/consent`, { share: true });
    assert.equal(other.status, 404, 'another user cannot touch this referral');
});

test('F3. referral status workflow incl. completion confirmation and "Unable to Connect"', async () => {
    const id = s.ref1._id;
    for (const status of ['Accepted', 'Referred', 'Follow-up Pending']) {
        const r = await s.counselor.patch(`/api/counselor/referrals/${id}`, { status });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.data.status, status);
    }
    const noProof = await s.counselor.patch(`/api/counselor/referrals/${id}`, { status: 'Completed' });
    assert.equal(noProof.status, 400);
    assert.match(noProof.data.message, /confirmed/);
    const done = await s.counselor.patch(`/api/counselor/referrals/${id}`, { status: 'Completed', outcomeNote: 'User confirmed by phone that DLSA appointment took place.' });
    assert.equal(done.status, 200);
    assert.equal(done.data.data.outcome.confirmed, true);
    assert.ok(done.data.data.closedAt);
    assert.equal(done.data.data.statusHistory.length, 5);

    const second = await s.counselor.post(`/api/counselor/cases/${s.caseRef2}/referrals`, { category: 'Relocation assistance information', title: 'Temporary shelter information', organization: { name: 'Local shelter (example)', contact: '000-000', website: 'https://example.org' } });
    assert.equal(second.status, 201);
    const noReason = await s.counselor.patch(`/api/counselor/referrals/${second.data.data._id}`, { status: 'Unable to Connect' });
    assert.equal(noReason.status, 400);
    const unable = await s.counselor.patch(`/api/counselor/referrals/${second.data.data._id}`, { status: 'Unable to Connect', unableReason: 'PRIVATE: shelter full until next month', userVisibleUpdate: 'We will look for another option together.' });
    assert.equal(unable.status, 200);
    s.ref2 = unable.data.data;
    const note = await s.counselor.post(`/api/counselor/referrals/${id}/notes`, { note: 'PRIVATE: follow-up call done' });
    assert.equal(note.status, 201);
    assert.equal(note.data.data.counselorNotes.length, 2);
    const raw = await col('referrals').findOne({ referralRef: s.ref2.referralRef });
    assert.match(raw.unableReason, /^enc:v1:/, 'private reason encrypted at rest');
});

test('F4. user sees non-sensitive referral status only', async () => {
    const r = await s.user2.get('/api/victim-support/referrals');
    assert.equal(r.status, 200);
    assert.equal(r.data.data.length, 2);
    const json = JSON.stringify(r.data);
    for (const secret of ['PRIVATE', 'prefers calls', 'shelter full', 'DLSA appointment', 'counselorNotes', 'unableReason']) {
        assert.ok(!json.includes(secret), `user view must not include "${secret}"`);
    }
    const unable = r.data.data.find((x) => x.status === 'Unable to Connect');
    assert.match(unable.statusMessage, /could not connect/);
    assert.equal(unable.update, 'We will look for another option together.');
    assert.equal(unable.externalIntegration, 'not_connected');
    const dash = await s.user2.get('/api/victim-support/dashboard');
    assert.equal(dash.data.data.referrals.length, 2);
    const consent = await s.user2.patch(`/api/victim-support/referrals/${s.ref1.referralRef}/consent`, { share: true });
    assert.equal(consent.status, 200);
    assert.equal(consent.data.data.userConsentToShare, true);
});

test('F5. external submission never transmits data without an authorised integration', async () => {
    const r = await s.counselor.post(`/api/counselor/referrals/${s.ref1._id}/external-submit`);
    assert.equal(r.status, 409);
    assert.equal(r.data.status, 'not_available');
    const audit = await col('auditevents').findOne({ action: 'EXTERNAL_REFERRAL_ATTEMPT' });
    assert.equal(audit.metadata.result, 'not_available');
    assert.ok(!JSON.stringify(audit).includes('private words'));
    const ints = await s.admin.get('/api/admin/integrations');
    assert.ok(ints.data.data.directory.every((d) => d.integration.status === 'not_connected'));
});

test('F6. integration interface: consent gate and minimal payload (fake adapter, in-process)', async () => {
    const svc = require('../services/integrations/externalReferralService');
    const sentPayloads = [];
    svc.registerAdapter({
        key: 'nalsa-15100', name: 'Fake adapter (test only)', isConfigured: () => true,
        buildPayload: (ref) => ({ referralRef: ref.referralRef, category: ref.category }),
        submit: async (payload) => { sentPayloads.push(payload); return { externalReference: 'EXT-1' }; },
    });
    try {
        const base = { _id: new mongoose.Types.ObjectId(), referralRef: 'RF-TEST01', caseRef: 'VS-TEST01', category: 'Legal aid information', organization: { directoryId: 'nalsa-15100' } };
        assert.equal((await svc.submitReferral({ ...base, userConsentToShare: false })).status, 'consent_required');
        assert.equal(sentPayloads.length, 0);
        const ok = await svc.submitReferral({ ...base, userConsentToShare: true });
        assert.equal(ok.status, 'submitted');
        assert.deepEqual(Object.keys(sentPayloads[0]).sort(), ['category', 'referralRef']);
        svc._adapters.get('nalsa-15100').submit = async () => { throw new Error('boom'); };
        assert.equal((await svc.submitReferral({ ...base, userConsentToShare: true })).status, 'failed');
    } finally {
        svc._adapters.clear();
    }
    assert.equal(svc.integrationStatus('nalsa-15100').status, 'not_connected');
});

test('F7. dashboards and analytics include referral tracking; deletion removes referrals', async () => {
    await s.counselor.post(`/api/counselor/cases/${s.caseRef2}/referrals`, { category: 'Mental health counseling', title: 'Tele-MANAS counselling', organization: { directoryId: 'telemanas' }, followUpDate: new Date(Date.now() - 86400000).toISOString() });
    const dash = await s.counselor.get('/api/counselor/dashboard');
    assert.equal(dash.data.data.stats.openReferrals, 1);
    assert.equal(dash.data.data.stats.referralsDue, 1);
    const due = await s.counselor.get('/api/counselor/referrals?due=1');
    assert.equal(due.data.data.length, 1);
    const analytics = await s.admin.get('/api/admin/analytics');
    assert.equal(analytics.data.data.referrals.byStatus.Completed, 1);
    assert.equal(analytics.data.data.referrals.byStatus['Unable to Connect'], 1);
    const caseView = await s.counselor.get(`/api/counselor/cases/${s.caseRef2}`);
    assert.equal(caseView.data.data.referrals.length, 3);

    await s.user2.post('/api/victim-support/consent/withdraw', { dataChoice: 'delete' });
    assert.equal(await col('referrals').countDocuments({ userId: await userId('mail_carol') }), 0);
});

test('audit trail for this flow exists and contains no secrets', async () => {
    const actions = new Set((await col('auditevents').distinct('action')));
    for (const a of ['PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'PASSWORD_RESET_THROTTLED', 'EMAIL_TEST_SENT', 'EMAIL_PROVIDER_VERIFIED', 'REMINDER_SENT', 'REMINDERS_RUN_MANUALLY', 'REFERRAL_CREATED', 'REFERRAL_STATUS_CHANGED', 'REFERRAL_NOTE_ADDED', 'REFERRAL_SHARE_CONSENT_CHANGED', 'EXTERNAL_REFERRAL_ATTEMPT']) {
        assert.ok(actions.has(a), `audit has ${a}`);
    }
    const all = JSON.stringify(await col('auditevents').find().toArray());
    for (const secret of [s.token1, s.token2, 'N3wSecurePass', 'PRIVATE', 'private words']) assert.ok(!all.includes(secret));
});
