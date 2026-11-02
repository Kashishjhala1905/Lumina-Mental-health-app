// Field-level encryption for sensitive free text (check-in comments, counselor notes, AI evidence).
// Uses AES-256-GCM with a key derived from DATA_ENCRYPTION_KEY. Without a key, values are stored
// as plain text (development only) and a warning is printed once.
const crypto = require('crypto');

const PREFIX = 'enc:v1:';
let cachedKey;
let warned = false;

function getKey() {
    if (cachedKey !== undefined) return cachedKey;
    const raw = process.env.DATA_ENCRYPTION_KEY && process.env.DATA_ENCRYPTION_KEY.trim();
    if (!raw) {
        cachedKey = null;
        if (!warned) {
            warned = true;
            console.warn('⚠️  DATA_ENCRYPTION_KEY is not set. Sensitive victim-support text is stored unencrypted (set it for any real deployment).');
        }
        return cachedKey;
    }
    cachedKey = crypto.createHash('sha256').update(raw).digest();
    return cachedKey;
}

function encryptText(value) {
    if (value === undefined || value === null || value === '') return value;
    const text = String(value);
    if (text.startsWith(PREFIX)) return text;
    const key = getKey();
    if (!key) return text;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptText(value) {
    if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
    const key = getKey();
    if (!key) return '[encrypted – DATA_ENCRYPTION_KEY not configured]';
    try {
        const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
        decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
    } catch {
        return '[unable to decrypt]';
    }
}

module.exports = { encryptText, decryptText };
