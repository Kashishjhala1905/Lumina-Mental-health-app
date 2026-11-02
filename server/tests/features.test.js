// End-to-end tests for the feature-enhancement release: counselling directory search & booking, meditation
// catalogue, exercises (duplicate fix + activity tracking), assessment history, saved chatbot conversations,
// daily check-ins, community identity privacy & moderation, feedback (+ notification email) and My History.
// Uses a throwaway database (lumina_test_<ts>_features) and a LOCAL SMTP sink – no email leaves the machine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { createSmtpSink } = require('./helpers/testMailServers');
const { localDateKey } = require('../utils/timezone');

const PORT = 7100 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_NAME = `lumina_test_${Date.now()}_features`;
const MONGO_URI = `${process.env.TEST_MONGO_URL || 'mongodb://localhost:27017'}/${DB_NAME}`;
const PASSWORD = 'Str0ngPassw0rd';
const FEEDBACK_INBOX = 'kashishjhala05@gmail.com'; // captured by the local sink only
const CLIENT_PUBLIC = path.join(__dirname, '..', '..', 'client', 'public');

let server;
let serverLog = '';
let smtp;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const col = (name) => mongoose.connection.collection(name);

class Client {
    constructor() { this.cookie = null; }
    async req(method, url, body) {
        const res = await fetch(BASE + url, {
            method,
            headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        for (const c of res.headers.getSetCookie?.() || []) {
            const pair = c.split(';')[0];
            const [name, ...rest] = pair.split('=');
            if (name === 'lumina_token') this.cookie = rest.join('=') ? pair : null;
        }
        let data = null;
        const text = await res.text();
        try { data = JSON.parse(text); } catch { /* non-JSON */ }
        return { status: res.status, data, text };
    }
    get(u) { return this.req('GET', u); }
    post(u, b) { return this.req('POST', u, b ?? {}); }
    patch(u, b) { return this.req('PATCH', u, b ?? {}); }
    put(u, b) { return this.req('PUT', u, b ?? {}); }
    del(u) { return this.req('DELETE', u); }
}

const reg = (n) => ({ name: `Feature Tester ${n}`, username: `feat_${n}`, email: `feat.${n}@example.test`, password: PASSWORD, confirmPassword: PASSWORD });
const s = { admin: new Client(), u1: new Client(), u2: new Client(), u3: new Client(), u4: new Client(), anon: new Client() };
const ids = {};

/** Decodes a (possibly RFC 2047 encoded, folded) Subject header. */
function subjectOf(m) {
    const raw = (m.raw.match(/^Subject: (.*(?:\r\n[ \t].*)*)/mi) || [])[1] || '';
    return raw.replace(/\r\n[ \t]/g, ' ').replace(/=\?utf-8\?([bq])\?([^?]*)\?=\s*/gi, (_, enc, text) => (enc.toLowerCase() === 'b'
        ? Buffer.from(text, 'base64').toString('utf8')
        : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8')));
}

/** Next date (YYYY-MM-DD, UTC) after today that falls on `weekday` (0 = Sunday). */
function nextWeekday(weekday, minDaysAhead = 1) {
    const d = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    d.setUTCDate(d.getUTCDate() + minDaysAhead);
    while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

test.before(async () => {
    smtp = await createSmtpSink();

    // ---- Pre-existing data from earlier builds (simulates a database that already has records) ----
    await mongoose.connect(MONGO_URI);
    const old = new Date('2025-01-01T00:00:00Z');
    // The old count-then-insert seeding race stored every exercise twice → the left/right duplicate bug
    const legacyEx = { description: 'old', category: 'Breathing', duration: 300, difficulty: 'Beginner', instructions: ['old'] };
    ids.legacyBox = (await col('exercises').insertOne({ ...legacyEx, title: 'Box Breathing', createdAt: old, updatedAt: old })).insertedId;
    ids.legacyBoxDup = (await col('exercises').insertOne({ ...legacyEx, title: 'Box Breathing', createdAt: new Date(old.getTime() + 5), updatedAt: old })).insertedId;
    await col('meditations').insertMany([
        { title: 'Forest Rain Reset', url: '/audio/nature-sounds.wav', category: 'Nature', duration: 30, createdAt: old },
        { title: 'Forest Rain Reset', url: '/audio/nature-sounds.wav', category: 'Nature', duration: 30, createdAt: old },
    ]);
    // A sample counsellor seeded by an earlier build, with an invented rating
    ids.legacyCounselor = (await col('counselors').insertOne({ name: 'Dr. Asha Mehta', city: 'Indore', specialization: ['Anxiety'], experienceYears: 8, languages: ['Hindi', 'English'], rating: 4.8, availability: [], reviews: [], createdAt: old, updatedAt: old })).insertedId;

    server = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: String(PORT),
            MONGO_URI,
            JWT_SECRET: `features-test-secret-${Date.now()}`,
            DATA_ENCRYPTION_KEY: 'features-test-encryption-key',
            REMINDERS_ENABLED: 'false',
            GROQ_API_KEY: 'invalid-key-to-exercise-fallback',
            GROQ_RETRY_COUNT: '0',
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
            EMAIL_MAX_ATTEMPTS: '1',
            RESEND_API_KEY: '',
            CLIENT_URL: 'https://lumina-test.example.org',
            FEEDBACK_NOTIFICATION_EMAIL: FEEDBACK_INBOX,
            FEEDBACK_RATE_LIMIT: '6',
            COMMUNITY_POST_RATE_LIMIT: '1000',
            REGISTER_RATE_LIMIT: '1000',
            API_RATE_LIMIT: '100000',
            CHATBOT_RATE_LIMIT: '1000',
            DEMO_COUNSELLORS_ENABLED: 'true',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', (d) => { serverLog += d; });
    server.stderr.on('data', (d) => { serverLog += d; });
    for (let i = 0; i < 80; i++) {
        try { if ((await (await fetch(`${BASE}/api/health`)).json()).db === 'connected') break; } catch { /* starting */ }
        await sleep(250);
    }

    await col('users').insertOne({ name: 'Feature Admin', username: 'feat_admin', email: 'feat.admin@example.test', password: await bcrypt.hash(PASSWORD, 12), role: 'admin', isApproved: true, tokenVersion: 0, counselorApplication: { status: 'none' }, createdAt: new Date(), updatedAt: new Date() });
    assert.equal((await s.admin.post('/api/auth/login', { identifier: 'feat_admin', password: PASSWORD })).status, 200);
    for (const [k, n] of [['u1', 'one'], ['u2', 'two'], ['u3', 'three'], ['u4', 'four']]) {
        const r = await s[k].post('/api/auth/register', reg(n));
        assert.equal(r.status, 201, JSON.stringify(r.data));
        ids[k] = r.data.user._id || r.data.user.id;
    }
    // A post written before the identity choice existed (no identity/title/status fields)
    ids.legacyPost = (await col('posts').insertOne({ user: new mongoose.Types.ObjectId(ids.u4), content: 'An older post from before the update.', likesCount: 0, likedBy: [], commentsCount: 0, reports: [], createdAt: old, updatedAt: old })).insertedId;
});

test.after(async () => {
    if (mongoose.connection.readyState === 1) {
        if (/^lumina_test_\d+_features$/.test(mongoose.connection.db.databaseName)) await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    }
    server?.kill();
    await smtp?.close();
});

// ======================= EXERCISES =======================

test('F1. exercises: no duplicates, unique slugs, 7 categories, full details', async () => {
    const r = await s.anon.get('/api/resources/exercises');
    assert.equal(r.status, 200);
    const list = r.data.data;
    assert.equal(list.length, 16);
    assert.equal(new Set(list.map((e) => e._id)).size, list.length, 'unique ids');
    assert.equal(new Set(list.map((e) => e.slug)).size, list.length, 'unique slugs');
    assert.equal(new Set(list.map((e) => e.title)).size, list.length, 'no duplicated titles (left/right duplicate bug)');
    assert.deepEqual(r.data.categories, ['Breathing Exercises', 'Grounding Techniques', 'Mindfulness Exercises', 'Physical Relaxation', 'Focus Exercises', 'Emotional Wellness Activities', 'Stress Management Exercises']);
    for (const c of r.data.categories) assert.ok(list.some((e) => e.category === c), `category ${c} has exercises`);
    for (const e of list) {
        assert.ok(e.title && e.description && e.instructions.length >= 3, `${e.slug} has instructions`);
        assert.ok(e.duration > 0 && ['Beginner', 'Intermediate', 'Advanced'].includes(e.difficulty) && e.icon, `${e.slug} metadata`);
    }
    // Existing records were adopted (id kept) and the race duplicate deactivated – nothing deleted
    const box = list.find((e) => e.slug === 'box-breathing');
    assert.equal(box._id, String(ids.legacyBox), 'oldest legacy record adopted, keeping its id');
    const dup = await col('exercises').findOne({ _id: ids.legacyBoxDup });
    assert.ok(dup, 'duplicate record still exists (non-destructive)');
    assert.equal(dup.active, false, 'duplicate hidden');
    // Filter by category
    const f = await s.anon.get('/api/resources/exercises?category=Grounding%20Techniques');
    assert.ok(f.data.data.length >= 2 && f.data.data.every((e) => e.category === 'Grounding Techniques'));
});

// ======================= MEDITATION =======================

test('F2. meditation catalogue: 8 categories, unique tracks, every audio file exists, licence recorded', async () => {
    const r = await s.anon.get('/api/resources/meditations');
    assert.equal(r.status, 200);
    const tracks = r.data.data;
    assert.deepEqual(r.data.categories, ['Guided Meditation', 'Deep Relaxation', 'Sleep Music', 'Stress Relief', 'Breathing Meditation', 'Mindfulness', 'Focus and Concentration', 'Nature Sounds']);
    for (const c of r.data.categories) assert.ok(tracks.some((t) => t.category === c && !t.isShortLoop), `full-length track for ${c}`);
    assert.equal(new Set(tracks.map((t) => t.slug)).size, tracks.length, 'unique slugs');
    assert.equal(tracks.filter((t) => t.title === 'Forest Rain Reset').length, 0, 'legacy duplicate titles gone');
    const manifest = require('../config/meditationTracks.json');
    for (const t of tracks) {
        const file = path.join(CLIENT_PUBLIC, t.url.replace(/^\//, ''));
        assert.ok(fs.existsSync(file) && fs.statSync(file).size > 10000, `audio file exists for ${t.slug}`);
        assert.ok(t.source && t.license, `${t.slug} records source and licence`);
        assert.ok(t.duration > 0);
        const m = manifest.find((x) => x.slug === t.slug);
        if (m) assert.equal(t.duration, m.durationSeconds, `${t.slug} duration matches the generated file`);
    }
    const breathing = tracks.find((t) => t.category === 'Breathing Meditation' && t.breathing);
    assert.ok(breathing.breathing.inhale > 0 && breathing.breathing.exhale > 0, 'breathing cue data');
    const guided = tracks.find((t) => t.category === 'Guided Meditation');
    assert.ok(guided.guide.length >= 5, 'guided prompts');
});

// ======================= RESOURCE ACTIVITY =======================

test('F3. activity tracking: start/complete once, ownership, strategy dedupe, my history', async () => {
    const ex = (await s.anon.get('/api/resources/exercises')).data.data[0];
    assert.equal((await s.anon.post('/api/resources/activity', { resourceType: 'exercise', resourceId: ex._id })).status, 401);
    const start = await s.u1.post('/api/resources/activity', { resourceType: 'exercise', resourceId: ex._id });
    assert.equal(start.status, 201);
    const id = start.data.data.activityId;
    assert.equal((await s.u1.patch(`/api/resources/activity/${id}`, { status: 'paused', durationSeconds: 5 })).status, 400);
    assert.equal((await s.u2.patch(`/api/resources/activity/${id}`, { status: 'completed', durationSeconds: 60 })).status, 404, 'other users cannot record on my session');
    const done = await s.u1.patch(`/api/resources/activity/${id}`, { status: 'completed', durationSeconds: 240 });
    assert.equal(done.status, 200);
    assert.equal(done.data.data.status, 'completed');
    const again = await s.u1.patch(`/api/resources/activity/${id}`, { status: 'completed', durationSeconds: 240 });
    assert.equal(again.status, 409, 'completion recorded only once');
    assert.equal(again.data.code, 'ALREADY_RECORDED');

    const track = (await s.anon.get('/api/resources/meditations')).data.data[0];
    const play = await s.u1.post('/api/resources/activity', { resourceType: 'meditation', resourceId: track.slug });
    assert.equal(play.status, 201, 'lookup by slug works');
    assert.equal((await s.u1.patch(`/api/resources/activity/${play.data.data.activityId}`, { status: 'abandoned', durationSeconds: 42 })).status, 200);

    const v1 = await s.u1.post('/api/resources/activity', { resourceType: 'strategy', resourceKey: 'sleep-hygiene', title: 'Sleep hygiene' });
    const v2 = await s.u1.post('/api/resources/activity', { resourceType: 'strategy', resourceKey: 'sleep-hygiene', title: 'Sleep hygiene' });
    assert.equal(v1.status, 201);
    assert.equal(v2.data.data.deduplicated, true, 'one strategy view per day');
    assert.equal((await s.u1.post('/api/resources/activity', { resourceType: 'strategy', resourceKey: 'x', title: '' })).status, 404);

    const mine = await s.u1.get('/api/resources/activity');
    assert.equal(mine.status, 200);
    assert.equal(mine.data.pagination.total, 3);
    assert.equal(mine.data.totals.exercise.completed, 1);
    assert.equal(mine.data.totals.meditation.seconds, 42);
    assert.equal((await s.u1.get('/api/resources/activity?type=exercise')).data.data.length, 1);
    assert.equal((await s.u2.get('/api/resources/activity')).data.pagination.total, 0, 'histories are isolated');
});

// ======================= ASSESSMENTS =======================

const answersAll = (v) => ({ stress: v, sleep: v, support: v, anxiety: v, satisfaction: v, emotions: v, coping: v, selfcare: v });

test('F4. assessments: server-side scoring (reverse items), history never overwritten, comparison, isolation', async () => {
    const def = await s.anon.get('/api/assessments/definition');
    assert.equal(def.data.data.questions.length, 8);

    const guest = await s.anon.post('/api/assessments', { answers: { ...answersAll(5), stress: 1, anxiety: 1 } });
    assert.equal(guest.status, 200);
    assert.equal(guest.data.saved, false);
    assert.equal(guest.data.data.score, 100, 'low stress & anxiety count as high wellbeing');
    assert.equal(await col('assessmentresults').countDocuments(), 0, 'guest results are not stored');

    assert.equal((await s.u1.post('/api/assessments', { answers: { stress: 3 } })).status, 400);
    const first = await s.u1.post('/api/assessments', { answers: answersAll(3) });
    assert.equal(first.status, 201);
    assert.equal(first.data.comparison, null);
    assert.equal(first.data.data.score, 50);
    const second = await s.u1.post('/api/assessments', { answers: { ...answersAll(4), stress: 2, anxiety: 2 } });
    assert.equal(second.status, 201);
    assert.equal(second.data.data.score, 75);
    assert.equal(second.data.data.result, 'Excellent');
    assert.equal(second.data.comparison.previousScore, 50);
    assert.equal(second.data.comparison.change, 25);

    const hist = await s.u1.get('/api/assessments/history');
    assert.equal(hist.data.data.length, 2, 'both results kept');
    assert.equal(hist.data.trend.length, 2);
    const firstStored = await s.u1.get(`/api/assessments/history/${first.data.data._id}`);
    assert.equal(firstStored.data.data.score, 50, 'earlier result unchanged');
    assert.equal((await s.u2.get(`/api/assessments/history/${first.data.data._id}`)).status, 404, 'other users cannot read it');
    assert.equal((await s.u2.get('/api/assessments/history')).data.data.length, 0);
});

// ======================= CHATBOT CONVERSATIONS =======================

test('F5. chatbot conversations: owner-only, encrypted at rest, message kept when AI fails, rename/delete', async () => {
    assert.equal((await s.anon.get('/api/chatbot/conversations')).status, 401);
    const conv = await s.u1.post('/api/chatbot/conversations', {});
    assert.equal(conv.status, 201);
    const id = conv.data.data._id;
    const send = await s.u1.post(`/api/chatbot/conversations/${id}/messages`, { message: 'I have been feeling stressed about exams' });
    assert.ok([401, 429, 500, 502, 503, 504].includes(send.status), `invalid Groq key handled (got ${send.status})`);
    assert.equal(send.data.data.userMessageSaved, true);
    assert.ok(!send.text.includes('invalid-key'), 'key never echoed');

    const raw = await col('conversations').findOne({ _id: new mongoose.Types.ObjectId(id) });
    assert.ok(raw.messages[0].content.startsWith('enc:v1:'), 'messages encrypted at rest');
    assert.equal(raw.title, 'I have been feeling stressed about exams', 'title from first message');

    const open = await s.u1.get(`/api/chatbot/conversations/${id}`);
    assert.equal(open.data.data.messages[0].content, 'I have been feeling stressed about exams', 'can continue the conversation');
    assert.equal((await s.u1.get('/api/chatbot/conversations')).data.data[0].messageCount, 1);

    // Nobody else – including administrators – can open, continue, rename or delete it
    for (const c of [s.u2, s.admin]) {
        assert.equal((await c.get(`/api/chatbot/conversations/${id}`)).status, 404);
        assert.equal((await c.post(`/api/chatbot/conversations/${id}/messages`, { message: 'hi' })).status, 404);
        assert.equal((await c.patch(`/api/chatbot/conversations/${id}`, { title: 'x' })).status, 404);
        assert.equal((await c.del(`/api/chatbot/conversations/${id}`)).status, 404);
        assert.equal((await c.get('/api/chatbot/conversations')).data.data.length, 0);
    }
    assert.equal((await s.u1.patch(`/api/chatbot/conversations/${id}`, { title: 'Exam stress' })).data.data.title, 'Exam stress');
    const second = await s.u1.post('/api/chatbot/conversations', { title: 'Second chat' });
    assert.equal((await s.u1.del(`/api/chatbot/conversations/${second.data.data._id}`)).status, 200);
    assert.equal((await s.u1.get('/api/chatbot/conversations')).data.data.length, 1);
});

// ======================= DAILY CHECK-INS =======================

test('F6. daily check-ins: local date, one per day, edit, validation, ownership, history range', async () => {
    const tz = 'Asia/Kolkata';
    const today = localDateKey(new Date(), tz);
    assert.equal((await s.u1.post('/api/mood', { mood: 'happy', stressLevel: 9, timezone: tz })).status, 400);
    const created = await s.u1.post('/api/mood', { mood: 'neutral', emotionalState: 4, stressLevel: 2, energyLevel: 3, sleepQuality: 4, notes: 'Good walk today', timezone: tz });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.data.localDate, today);
    assert.equal(created.data.data.timezone, tz);
    assert.ok(!('user' in created.data.data));
    const dup = await s.u1.post('/api/mood', { mood: 'sad', timezone: tz });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.code, 'ALREADY_CHECKED_IN');
    assert.equal(dup.data.data._id, created.data.data._id, 'returns today’s check-in to edit');

    const t = await s.u1.get(`/api/mood/today?timezone=${encodeURIComponent(tz)}`);
    assert.equal(t.data.data._id, created.data.data._id);
    const edit = await s.u1.put(`/api/mood/${created.data.data._id}`, { mood: 'happy', stressLevel: 1, user: ids.u2 });
    assert.equal(edit.status, 200);
    assert.equal(edit.data.data.mood, 'happy');
    assert.ok(edit.data.data.editedAt, 'edit time recorded');
    const stored = await col('moodentries').findOne({ _id: new mongoose.Types.ObjectId(created.data.data._id) });
    assert.equal(String(stored.user), String(ids.u1), 'owner cannot be changed');
    assert.equal(stored.date.toISOString(), `${today}T00:00:00.000Z`, 'stored as UTC midnight of the local date');
    assert.ok(stored.checkinAt instanceof Date);
    assert.equal((await s.u2.put(`/api/mood/${created.data.data._id}`, { mood: 'sad' })).status, 404);
    assert.equal((await s.u2.del(`/api/mood/${created.data.data._id}`)).status, 404);

    // Another user, another timezone: independent entry
    assert.equal((await s.u2.post('/api/mood', { mood: 'anxious', timezone: 'America/New_York' })).status, 201);
    const range = await s.u1.get(`/api/mood?from=${today}&to=${today}`);
    assert.equal(range.data.data.length, 1);
    assert.equal((await s.u1.get('/api/mood?from=2000-01-01&to=2000-01-02')).data.data.length, 0);
});

// ======================= COMMUNITY =======================

test('F7. community: anonymous posts never leak the author; identity choice required; safety checks', async () => {
    assert.equal((await s.u1.post('/api/community/posts', { title: 'Hi', content: 'Hello there', category: 'General' })).status, 400, 'identity choice required');
    assert.equal((await s.u1.post('/api/community/posts', { content: 'Hello there', identity: 'public' })).status, 400, 'title required');
    assert.equal((await s.u1.post('/api/community/posts', { title: 'Contact', content: 'mail me at someone@example.com', identity: 'public' })).status, 400, 'personal contact details blocked');

    const anon = await s.u1.post('/api/community/posts', { title: 'Exam week', content: 'Feeling the pressure but trying breathing exercises.', category: 'Studies & Work', identity: 'anonymous' });
    assert.equal(anon.status, 201);
    ids.anonPost = anon.data.data._id;
    assert.deepEqual(anon.data.data.author, { name: 'Anonymous User', initial: 'A', anonymous: true });
    assert.equal(anon.data.data.isMine, true);
    const pub = await s.u2.post('/api/community/posts', { title: 'Gratitude', content: 'Thankful for a calm morning.', category: 'Gratitude', identity: 'public' });
    assert.equal(pub.data.data.author.name, 'Feature Tester two');
    ids.pubPost = pub.data.data._id;

    const forbidden = ['Feature Tester one', 'feat_one', 'feat.one@example.test', String(ids.u1)];
    for (const viewer of [s.anon, s.u2, s.u3]) {
        const feed = await viewer.get('/api/community/posts');
        assert.equal(feed.status, 200);
        const item = feed.data.data.find((p) => p._id === ids.anonPost);
        assert.ok(item);
        assert.equal(item.author.name, 'Anonymous User');
        assert.equal(item.isMine, false);
        for (const secret of forbidden) assert.ok(!feed.text.includes(secret), `feed never contains ${secret}`);
        const ref = feed.text.match(/.{0,80}"(likedBy|user)"\s*:.{0,80}/);
        assert.equal(ref, null, `no raw user references: ${ref && ref[0]}`);
        const single = await viewer.get(`/api/community/posts/${ids.anonPost}`);
        for (const secret of forbidden) assert.ok(!single.text.includes(secret));
    }
    const legacy = (await s.anon.get('/api/community/posts')).data.data.find((p) => p._id === String(ids.legacyPost));
    assert.equal(legacy.author.anonymous, true, 'posts without a recorded identity choice are shown anonymously');
    assert.equal(legacy.category, 'General');

    const crisis = await s.u3.post('/api/community/posts', { title: 'Hard night', content: 'I feel hopeless and want to end my life', identity: 'anonymous' });
    assert.equal(crisis.status, 201);
    assert.equal(crisis.data.supportPrompt, true, 'author is shown helplines');
    assert.equal((await col('posts').findOne({ _id: new mongoose.Types.ObjectId(crisis.data.data._id) })).flaggedForReview, true);
    const cat = await s.anon.get('/api/community/posts?category=Gratitude');
    assert.ok(cat.data.data.length >= 1 && cat.data.data.every((p) => p.category === 'Gratitude'));
});

test('F8. community: ownership, likes, anonymous comments, reports, auto-hide and moderation', async () => {
    assert.equal((await s.u2.patch(`/api/community/posts/${ids.anonPost}`, { content: 'hacked' })).status, 403);
    assert.equal((await s.u2.del(`/api/community/posts/${ids.anonPost}`)).status, 403);
    const edited = await s.u1.patch(`/api/community/posts/${ids.anonPost}`, { content: 'Feeling the pressure, but breathing exercises help.' });
    assert.equal(edited.status, 200);
    assert.ok(edited.data.data.editedAt);
    assert.equal(edited.data.data.author.anonymous, true);

    const like = await s.u2.put(`/api/community/posts/${ids.anonPost}/like`);
    assert.equal(like.data.liked, true);
    assert.equal(like.data.likesCount, 1);
    assert.equal((await s.u2.put(`/api/community/posts/${ids.anonPost}/like`)).data.liked, false, 'toggle');

    const comment = await s.u3.post(`/api/community/posts/${ids.anonPost}/comments`, { content: 'You are not alone!', anonymous: true });
    assert.equal(comment.status, 201);
    assert.equal(comment.data.data.author.name, 'Anonymous User');
    const feed = await s.anon.get('/api/community/posts');
    assert.ok(!feed.text.includes('Feature Tester three'), 'anonymous commenter hidden');
    assert.equal((await s.u2.del(`/api/community/comments/${comment.data.data._id}`)).status, 403);

    assert.equal((await s.u1.post(`/api/community/posts/${ids.pubPost}/report`, { reason: 'Spam' })).status, 200);
    assert.equal((await s.u2.post(`/api/community/posts/${ids.pubPost}/report`, { reason: 'Spam' })).status, 400, 'cannot report own post');
    await s.u1.post(`/api/community/posts/${ids.pubPost}/report`, { reason: 'Spam' }); // repeat by same user counts once
    await s.u3.post(`/api/community/posts/${ids.pubPost}/report`, { reason: 'Harassment or bullying' });
    let pubFeed = await s.anon.get('/api/community/posts');
    assert.ok(pubFeed.data.data.some((p) => p._id === ids.pubPost), 'two reports: still visible');
    await s.u4.post(`/api/community/posts/${ids.pubPost}/report`, { reason: 'Spam' });
    pubFeed = await s.anon.get('/api/community/posts');
    assert.ok(!pubFeed.data.data.some((p) => p._id === ids.pubPost), 'three distinct reports: hidden pending review');
    const mine = await s.u2.get('/api/community/posts/mine');
    assert.equal(mine.data.data.find((p) => p._id === ids.pubPost).status, 'hidden', 'author still sees it with its status');

    assert.equal((await s.u1.get('/api/admin/community/posts')).status, 403, 'moderation is admin-only');
    const queue = await s.admin.get('/api/admin/community/posts?filter=flagged');
    assert.equal(queue.status, 200);
    const queued = queue.data.data.find((p) => p._id === ids.pubPost);
    assert.equal(queued.reports.length, 3);
    assert.ok(!('user' in queued.reports[0]), 'reporters are not identified');
    const anonQueued = (await s.admin.get('/api/admin/community/posts?filter=all')).data.data.find((p) => p._id === ids.anonPost);
    assert.equal(anonQueued.author.name, 'Anonymous User', 'anonymous stays anonymous for moderators');
    assert.equal((await s.admin.patch(`/api/admin/community/posts/${ids.pubPost}`, { status: 'published', note: 'Reviewed – fine' })).status, 200);
    assert.ok((await s.anon.get('/api/community/posts')).data.data.some((p) => p._id === ids.pubPost), 'restored');
    assert.equal((await s.admin.patch(`/api/admin/community/posts/${ids.pubPost}`, { status: 'removed' })).status, 200);
    assert.equal((await s.u2.patch(`/api/community/posts/${ids.pubPost}`, { content: 'again' })).status, 409, 'removed posts cannot be edited');
    assert.ok(await col('auditevents').findOne({ action: 'COMMUNITY_POST_MODERATED' }));

    const del = await s.u1.del(`/api/community/posts/${ids.anonPost}`);
    assert.equal(del.status, 200);
    assert.equal(await col('comments').countDocuments({ post: new mongoose.Types.ObjectId(ids.anonPost) }), 0);
});

// ======================= COUNSELLING =======================

const slotsMonWed = [{ day: 1, slots: ['10:00-11:00', '15:00-16:00'] }, { day: 3, slots: ['11:00-12:00'] }];

test('F9. counsellor directory: admin-managed, demo labelled, legacy rating hidden, only verified as professionals', async () => {
    const profile = { name: 'Priya Sharma', city: 'Indore', specialization: ['Anxiety', 'Stress Management'], languages: ['Hindi', 'English'], qualifications: 'M.Phil Clinical Psychology (RCI registered)', experienceYears: 9, consultationModes: ['online', 'offline'], weeklySlots: slotsMonWed };
    assert.equal((await s.u1.post('/api/admin/counsellors', profile)).status, 403);
    assert.equal((await s.admin.post('/api/admin/counsellors', { ...profile, weeklySlots: [{ day: 1, slots: ['10am'] }] })).status, 400);
    const verified = await s.admin.post('/api/admin/counsellors', { ...profile, verify: true, availabilityVerified: true });
    assert.equal(verified.status, 201, JSON.stringify(verified.data));
    ids.verified = verified.data.data._id;
    const pending = await s.admin.post('/api/admin/counsellors', { ...profile, name: 'Unverified Person', city: 'Bhopal', consultationModes: ['offline'] });
    ids.pending = pending.data.data._id;
    const online = await s.admin.post('/api/admin/counsellors', { ...profile, name: 'Arjun Nair', city: 'Kochi', languages: ['Malayalam', 'English'], consultationModes: ['online'], specialization: ['Depression'], verify: true });
    ids.online = online.data.data._id;
    assert.ok(await col('auditevents').findOne({ action: 'COUNSELLOR_PROFILE_CREATED' }));

    const all = await s.anon.get('/api/counseling/counselors?limit=24');
    assert.equal(all.status, 200);
    const names = all.data.data.map((c) => c.name);
    assert.ok(!names.includes('Unverified Person'), 'pending profiles are never listed');
    assert.equal(all.data.data[0].verified, true, 'verified professionals listed first');
    const demo = all.data.data.find((c) => c.name === 'Dr. Asha Mehta');
    assert.equal(demo.isDemo, true, 'legacy sample is labelled demo');
    assert.equal(demo.verified, false);
    assert.equal(demo.rating, null, 'invented legacy rating is never shown');
    assert.equal(demo.availability.status, 'demo');
    assert.ok(!all.text.includes('4.8'));
    const v = all.data.data.find((c) => c._id === ids.verified);
    assert.equal(v.availability.status, 'verified');
    assert.equal(all.data.data.find((c) => c._id === ids.online).availability.status, 'unverified', 'availability unverified unless confirmed');
    assert.equal((await s.anon.get(`/api/counseling/counselors/${ids.pending}`)).status, 404);
    assert.equal((await s.admin.patch(`/api/admin/counsellors/${ids.legacyCounselor}`, { verificationStatus: 'verified' })).status, 409, 'demo can never be verified');
});

test('F10. counselling search: city (case/prefix), filters, empty results, pagination, meta', async () => {
    const indore = await s.anon.get('/api/counseling/counselors?city=indore');
    assert.deepEqual(indore.data.data.map((c) => c.name), ['Priya Sharma', 'Dr. Asha Mehta']);
    assert.equal((await s.anon.get('/api/counseling/counselors?city=Ind')).data.pagination.total, 2, 'prefix match');
    const none = await s.anon.get('/api/counseling/counselors?city=Atlantis');
    assert.equal(none.status, 200);
    assert.equal(none.data.data.length, 0);
    assert.equal(none.data.pagination.total, 0);
    assert.equal((await s.anon.get('/api/counseling/counselors?city=%5E.*%24')).data.data.length, 0, 'regex characters are escaped');
    assert.deepEqual((await s.anon.get('/api/counseling/counselors?mode=online&language=Malayalam')).data.data.map((c) => c.name), ['Arjun Nair']);
    assert.deepEqual((await s.anon.get('/api/counseling/counselors?availability=verified')).data.data.map((c) => c.name), ['Priya Sharma']);
    assert.deepEqual((await s.anon.get('/api/counseling/counselors?specialization=Depression')).data.data.map((c) => c.name), ['Arjun Nair']);
    assert.ok((await s.anon.get('/api/counseling/counselors?includeDemo=false')).data.data.every((c) => !c.isDemo));
    assert.equal((await s.anon.get('/api/counseling/counselors?minRating=4')).data.data.length, 0, 'no genuine ratings yet');
    const p1 = await s.anon.get('/api/counseling/counselors?limit=1&page=1');
    const p2 = await s.anon.get('/api/counseling/counselors?limit=1&page=2');
    assert.equal(p1.data.pagination.pages, p1.data.pagination.total);
    assert.notEqual(p1.data.data[0]._id, p2.data.data[0]._id);
    const meta = await s.anon.get('/api/counseling/meta');
    assert.ok(meta.data.data.cities.includes('Indore') && meta.data.data.cities.includes('Kochi'));
    assert.ok(!meta.data.data.cities.includes('Bhopal'), 'cities only from listable profiles');
    assert.equal(meta.data.data.verifiedCount, 2);
    assert.equal(meta.data.data.ratingsAvailable, false);
});

test('F11. counselling booking: slot must match the weekly schedule; no past dates; no double booking', async () => {
    const monday = nextWeekday(1);
    const tuesday = nextWeekday(2);
    assert.equal((await s.anon.post('/api/counseling/bookings', { counselorId: ids.verified, date: monday, timeSlot: '10:00-11:00' })).status, 401);
    assert.equal((await s.u1.post('/api/counseling/bookings', { counselorId: ids.verified, date: '2020-01-06', timeSlot: '10:00-11:00' })).status, 400, 'past date');
    assert.equal((await s.u1.post('/api/counseling/bookings', { counselorId: ids.verified, date: tuesday, timeSlot: '10:00-11:00' })).status, 400, 'no slots on Tuesday');
    assert.equal((await s.u1.post('/api/counseling/bookings', { counselorId: ids.verified, date: monday, timeSlot: '11:00-12:00' })).status, 400, 'slot not offered on Monday');
    assert.equal((await s.u1.post('/api/counseling/bookings', { counselorId: ids.pending, date: monday, timeSlot: '10:00-11:00' })).status, 404, 'unverified profiles cannot be booked');
    const ok = await s.u1.post('/api/counseling/bookings', { counselorId: ids.verified, date: monday, timeSlot: '10:00-11:00', concern: 'Exam stress' });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.match(ok.data.message, /pending/);
    assert.equal((await s.u2.post('/api/counseling/bookings', { counselorId: ids.verified, date: monday, timeSlot: '10:00-11:00' })).status, 409);
    const demoDay = nextWeekday(1);
    const demoBooking = await s.u3.post('/api/counseling/bookings', { counselorId: String(ids.legacyCounselor), date: demoDay, timeSlot: '10:00-11:00' });
    assert.equal(demoBooking.status, 201, JSON.stringify(demoBooking.data));
    assert.match(demoBooking.data.message, /demo/i, 'demo bookings say no real session will take place');
    const my = await s.u1.get('/api/counseling/bookings/my');
    assert.equal(my.data.data.length, 1);
    assert.equal(my.data.data[0].counselor.name, 'Priya Sharma');
});

// ======================= FEEDBACK =======================

test('F12. feedback: validation, 1–5 stars stored, notification email to the configured inbox without user identity', async () => {
    assert.equal((await s.anon.post('/api/feedback', { rating: 5, category: 'Meditation', note: 'x' })).status, 401);
    assert.equal((await s.u1.post('/api/feedback', { rating: 0, category: 'Meditation', note: 'Nice' })).status, 400);
    assert.equal((await s.u1.post('/api/feedback', { rating: 6, category: 'Meditation', note: 'Nice' })).status, 400);
    assert.equal((await s.u1.post('/api/feedback', { rating: 3, category: 'Weather', note: 'Nice' })).status, 400);
    assert.equal((await s.u1.post('/api/feedback', { rating: 3, category: 'Meditation', note: '' })).status, 400);
    assert.equal((await s.u1.post('/api/feedback', { rating: 3, category: 'Meditation', note: 'x'.repeat(281) })).status, 400);

    const low = await s.u1.post('/api/feedback', { rating: 1, category: 'Chatbot', note: 'The chatbot was slow to answer.', comments: 'Took a long time.' });
    assert.equal(low.status, 201, JSON.stringify(low.data));
    assert.equal(low.data.data.emailStatus, 'accepted');
    const mail = await smtp.waitFor((m) => m.to.includes(FEEDBACK_INBOX) && /1\/5/.test(subjectOf(m)));
    assert.ok(mail, 'feedback email delivered to the configured inbox (local sink)');
    assert.match(mail.text, /The chatbot was slow to answer\./);
    assert.match(mail.text, /Chatbot/);
    for (const secret of ['Feature Tester one', 'feat_one', 'feat.one@example.test']) assert.ok(!mail.raw.includes(secret), 'no user identity in the email');
    const track = (await s.anon.get('/api/resources/meditations')).data.data[0];
    const high = await s.u1.post('/api/feedback', { rating: 5, category: 'Meditation', note: 'Loved the rain track!', relatedType: 'meditation', relatedId: track._id });
    assert.equal(high.status, 201);
    assert.equal(high.data.data.related.label, track.title);
    assert.ok(await smtp.waitFor((m) => /5\/5/.test(subjectOf(m))));

    const stored = await col('feedbacks').find({}).toArray();
    assert.deepEqual(stored.map((f) => f.rating).sort(), [1, 5]);
    assert.ok(stored.every((f) => f.email.status === 'accepted' && f.email.deliveryId));
    const deliveries = await col('emaildeliveries').find({ type: 'feedback' }).toArray();
    assert.equal(deliveries.length, 2);
    assert.ok(deliveries.every((d) => d.status === 'accepted'));

    const dup = await s.u1.post('/api/feedback', { rating: 5, category: 'Meditation', note: 'Loved the rain track!', relatedType: 'meditation', relatedId: track._id });
    assert.equal(dup.status, 409, 'duplicate prevented');
    assert.equal(await col('feedbacks').countDocuments(), 2);
});

test('F13. feedback: counsellor ratings only from users with a booking; genuine rating then shown', async () => {
    assert.equal((await s.u2.post('/api/feedback', { rating: 5, category: 'Counselling', note: 'Great', relatedType: 'counselor', relatedId: ids.verified })).status, 403, 'no booking → cannot rate');
    const r = await s.u1.post('/api/feedback', { rating: 4, category: 'Counselling', note: 'Helpful first session', relatedType: 'counselor', relatedId: ids.verified });
    assert.equal(r.status, 201);
    const c = await s.anon.get(`/api/counseling/counselors/${ids.verified}`);
    assert.deepEqual(c.data.data.rating, { average: 4, count: 1 });
    assert.deepEqual((await s.anon.get('/api/counseling/counselors?minRating=4')).data.data.map((x) => x.name), ['Priya Sharma']);
    const opts = await s.u1.get('/api/feedback/options');
    assert.deepEqual(opts.data.data.counselors.map((x) => x.name), ['Priya Sharma']);
});

test('F14. feedback: stored even when the email provider fails; failure tracked; rate limited; isolated', async () => {
    smtp.setMode('auth_fail');
    const r = await s.u2.post('/api/feedback', { rating: 2, category: 'Community', note: 'Could use more categories.' });
    smtp.setMode('ok');
    assert.equal(r.status, 201, 'feedback still saved');
    assert.equal(r.data.data.emailStatus, 'failed');
    const doc = await col('feedbacks').findOne({ _id: new mongoose.Types.ObjectId(r.data.data._id) });
    assert.equal(doc.email.status, 'failed');
    assert.ok(doc.email.errorCode);

    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await s.u3.post('/api/feedback', { rating: 4, category: 'Other', note: `Idea number ${i}` })).status);
    assert.deepEqual(codes, [201, 201, 201, 201, 201, 201, 429], 'per-user hourly limit');

    const mine = await s.u2.get('/api/feedback/mine');
    assert.equal(mine.data.data.length, 1);
    assert.equal((await s.u1.get('/api/admin/feedback')).status, 403);
    const admin = await s.admin.get('/api/admin/feedback');
    assert.equal(admin.data.stats.count, 10);
    assert.equal(admin.data.notificationRecipientConfigured, true);
    assert.ok(!admin.text.includes(String(ids.u1)) && !admin.text.includes('feat.one@example.test'), 'admin list has no user identities');
});

// ======================= MY HISTORY =======================

test('F15. My History summary counts only the signed-in user’s records', async () => {
    assert.equal((await s.anon.get('/api/history/summary')).status, 401);
    const h1 = (await s.u1.get('/api/history/summary')).data.data;
    assert.deepEqual(h1.counts, { assessments: 2, conversations: 1, meditation: 1, exercise: 1, resources: 1, checkins: 1, posts: 0, feedback: 3 });
    assert.equal(h1.lastAssessment.score, 75);
    assert.equal(h1.lastCheckin.mood, 'happy');
    const h2 = (await s.u2.get('/api/history/summary')).data.data;
    assert.deepEqual(h2.counts, { assessments: 0, conversations: 0, meditation: 0, exercise: 0, resources: 0, checkins: 1, posts: 1, feedback: 1 });
});

test('server log contains no secrets', () => {
    assert.ok(!serverLog.includes('invalid-key-to-exercise-fallback'), 'Groq key never logged');
    assert.ok(!serverLog.includes('lumina-test-password'), 'SMTP password never logged');
});
