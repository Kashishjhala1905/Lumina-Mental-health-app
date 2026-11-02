#!/usr/bin/env node
/* Generates Lumina's original meditation tracks (AAC/ADTS) using headless Chrome.
 *   node tools/meditation-audio/generate.cjs            (from the client/ folder)
 * Env: CHROME_PATH (default: C:/Program Files/Google/Chrome/Application/chrome.exe)
 * Writes: client/public/audio/meditation/<slug>.aac
 *         server/config/meditationTracks.json   (catalogue metadata used by the API)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'public', 'audio', 'meditation');
const CATALOGUE = path.join(ROOT, '..', 'server', 'config', 'meditationTracks.json');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const synthSource = fs.readFileSync(path.join(__dirname, 'synth.js'), 'utf8');
    // AudioEncoder needs a secure context: serve a blank page on localhost
    const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>synth</title>'); });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const pagePort = server.address().port;
    const debugPort = 9200 + Math.floor(Math.random() * 500);
    const profile = path.join(require('os').tmpdir(), `lumina-synth-${debugPort}`);
    const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });

    let wsUrl;
    for (let i = 0; i < 200 && !wsUrl; i++) {
        try { wsUrl = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ }
        if (!wsUrl) await sleep(200);
    }
    if (!wsUrl) throw new Error('Chrome did not start – set CHROME_PATH');
    const ws = new WebSocket(wsUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const evaluate = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluation failed');
        return r.result.result.value;
    };

    await send('Page.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${pagePort}/` });
    await sleep(800);
    await evaluate(`${synthSource}; true`);
    const tracks = await evaluate('window.LuminaSynth.TRACKS');
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const catalogue = [];
    for (const t of tracks) {
        const started = Date.now();
        const r = await evaluate(`window.LuminaSynth.renderAndEncode(${JSON.stringify(t.slug)})`);
        const file = path.join(OUT_DIR, `${t.slug}.aac`);
        fs.writeFileSync(file, Buffer.from(r.base64, 'base64'));
        if (Math.abs(r.decodedSeconds - t.duration) > 1) throw new Error(`${t.slug}: decoded ${r.decodedSeconds}s, expected ${t.duration}s`);
        catalogue.push({
            slug: t.slug,
            title: t.title,
            category: t.category,
            description: t.description,
            url: `/audio/meditation/${t.slug}.aac`,
            durationSeconds: t.duration,
            bytes: r.bytes,
            guide: (t.guide || []).map(([at, text]) => ({ at, text })),
            breathing: t.breathing || null,
            source: 'Original audio synthesised for Lumina (client/tools/meditation-audio) – no third-party samples',
            license: 'Original work of the Lumina project',
        });
        console.log(`✔ ${t.slug.padEnd(30)} ${t.duration}s  ${(r.bytes / 1024).toFixed(0)} KB  (${Date.now() - started} ms)`);
    }
    fs.writeFileSync(CATALOGUE, `${JSON.stringify(catalogue, null, 2)}\n`);
    console.log(`Catalogue written to ${path.relative(path.join(ROOT, '..'), CATALOGUE)}`);
    ws.close();
    chrome.kill();
    server.close();
})().catch((err) => { console.error(err); process.exit(1); });
