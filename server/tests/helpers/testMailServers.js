// Local, in-process stand-ins for email providers (TESTS ONLY – nothing leaves the machine):
//  • createSmtpSink(): a minimal SMTP server speaking real SMTP to nodemailer, capturing messages.
//    Modes: 'ok' | 'auth_fail' (535) | 'tempfail_once' (421 on MAIL FROM once, then OK)
//  • createMockResend(): an HTTP server implementing POST /emails like Resend's API, with scripted responses.
const net = require('net');
const http = require('http');

function createSmtpSink() {
    const sink = { messages: [], mode: 'ok', tempFailCount: 0, authAttempts: 0 };
    const server = net.createServer((socket) => {
        let buffer = '';
        let inData = false;
        let from = null;
        let rcpts = [];
        const send = (line) => socket.write(`${line}\r\n`);
        send('220 lumina-test-smtp ESMTP ready');
        socket.on('error', () => {});
        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            for (;;) {
                if (inData) {
                    const end = buffer.indexOf('\r\n.\r\n');
                    if (end === -1) return;
                    const raw = buffer.slice(0, end).replace(/\r\n\.\./g, '\r\n.');
                    buffer = buffer.slice(end + 5);
                    inData = false;
                    sink.messages.push({ from, to: rcpts, raw, text: decodeMime(raw), subject: (raw.match(/^Subject: (.*)$/mi) || [])[1] });
                    send(`250 2.0.0 queued as TEST${sink.messages.length}`);
                    continue;
                }
                const idx = buffer.indexOf('\r\n');
                if (idx === -1) return;
                const line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                const cmd = line.slice(0, 4).toUpperCase();
                if (cmd === 'EHLO' || cmd === 'HELO') socket.write('250-lumina-test-smtp\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n');
                else if (cmd === 'AUTH') { sink.authAttempts++; send(sink.mode === 'auth_fail' ? '535 5.7.8 Authentication credentials invalid' : '235 2.7.0 Authentication successful'); }
                else if (cmd === 'MAIL') {
                    if (sink.mode === 'tempfail_once' && sink.tempFailCount === 0) { sink.tempFailCount++; send('421 4.7.0 Temporary failure, try again later'); socket.end(); return; }
                    from = line; rcpts = []; send('250 2.1.0 OK');
                } else if (cmd === 'RCPT') { rcpts.push(line.replace(/^RCPT TO:\s*<?([^>\s]*)>?.*$/i, '$1')); send('250 2.1.5 OK'); }
                else if (cmd === 'DATA') { inData = true; send('354 End data with <CR><LF>.<CR><LF>'); }
                else if (cmd === 'RSET') { from = null; rcpts = []; send('250 OK'); }
                else if (cmd === 'NOOP') send('250 OK');
                else if (cmd === 'QUIT') { send('221 Bye'); socket.end(); return; }
                else send('502 5.5.2 Command not recognized');
            }
        });
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
        sink.port = server.address().port;
        sink.setMode = (mode) => { sink.mode = mode; sink.tempFailCount = 0; };
        sink.close = () => new Promise((r) => server.close(r));
        sink.waitFor = async (predicate, ms = 6000) => {
            const end = Date.now() + ms;
            while (Date.now() < end) {
                const found = sink.messages.find(predicate);
                if (found) return found;
                await new Promise((r) => setTimeout(r, 50));
            }
            return null;
        };
        resolve(sink);
    }));
}

function decodeQuotedPrintable(body) {
    const cleaned = body.replace(/=\r?\n/g, '');
    const bytes = [];
    for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === '=' && /^[0-9A-F]{2}$/i.test(cleaned.slice(i + 1, i + 3))) { bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16)); i += 2; }
        else bytes.push(...Buffer.from(cleaned[i], 'utf8'));
    }
    return Buffer.from(bytes).toString('utf8');
}

/** Decodes the text/html MIME parts of a raw message (quoted-printable / base64 / 7bit). */
function decodeMime(raw) {
    const split = raw.indexOf('\r\n\r\n');
    const head = split === -1 ? '' : raw.slice(0, split);
    const body = split === -1 ? raw : raw.slice(split + 4);
    // Nested multiparts (e.g. multipart/related wrapping multipart/alternative when an inline logo is attached)
    const boundary = (head.match(/boundary="?([^";\r\n]+)"?/i) || [])[1];
    if (boundary) return body.split(`--${boundary}`).slice(1).filter((p) => !p.startsWith('--')).map((p) => decodeMime(p.replace(/^\r\n/, ''))).join('\n');
    if (/content-type:\s*(image|application)\//i.test(head)) return ''; // binary attachments
    if (/content-transfer-encoding:\s*base64/i.test(head)) return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    if (/content-transfer-encoding:\s*quoted-printable/i.test(head)) return decodeQuotedPrintable(body);
    return body;
}

function createMockResend() {
    const mock = { requests: [], script: [] };
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
            mock.requests.push({ method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
            const step = mock.script.shift() || { status: 200, body: { id: `re_${mock.requests.length}` } };
            setTimeout(() => {
                if (res.writableEnded || res.destroyed || req.socket.destroyed) return; // client already timed out
                res.writeHead(step.status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(step.body || {}));
            }, step.delayMs || 0);
        });
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
        mock.url = `http://127.0.0.1:${server.address().port}`;
        mock.reset = (script = []) => { mock.requests = []; mock.script = script; };
        mock.close = () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
        resolve(mock);
    }));
}

module.exports = { createSmtpSink, createMockResend, decodeMime };
