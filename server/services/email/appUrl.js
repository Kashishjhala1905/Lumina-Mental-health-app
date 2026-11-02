// Public URL of the Lumina web app, used to build links in emails (e.g. password reset).
// Source: APP_BASE_URL, otherwise the first CLIENT_URL. Development falls back to http://localhost:5173;
// production NEVER falls back to localhost – links are not sent until the URL is configured.
// The client uses a HashRouter, so in-app links look like `${base}/#/reset-password`.
const DEV_FALLBACK = 'http://localhost:5173';

function configuredAppUrl() {
    const raw = process.env.APP_BASE_URL || (process.env.CLIENT_URL || '').split(',')[0];
    return (raw || '').trim().replace(/\/+$/, '');
}

function getAppBaseUrl() {
    const configured = configuredAppUrl();
    if (configured) return configured;
    return process.env.NODE_ENV === 'production' ? '' : DEV_FALLBACK;
}

/** Problems that would make email links unusable for recipients. */
function appUrlIssues() {
    const configured = configuredAppUrl();
    if (process.env.NODE_ENV !== 'production') return [];
    if (!configured) return ['CLIENT_URL (or APP_BASE_URL) is not set – password reset links cannot be built'];
    if (/localhost|127\.0\.0\.1/.test(configured)) return ['CLIENT_URL points to localhost – recipients cannot open email links'];
    if (!configured.startsWith('https://')) return ['CLIENT_URL should use https:// in production'];
    return [];
}

const appLink = (hashPath) => {
    const base = getAppBaseUrl();
    return base ? `${base}/#${hashPath.startsWith('/') ? hashPath : `/${hashPath}`}` : '';
};

module.exports = { getAppBaseUrl, appLink, appUrlIssues };
