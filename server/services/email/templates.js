// Lumina-branded email templates (inline styles + table layout for broad email-client support).
// Content is deliberately discreet: no email ever mentions victim support, check-in answers or case details.
const { getAppBaseUrl, appLink } = require('./appUrl');

// Logo for the email header, set per render by renderEmail() (cid: for SMTP inline images, or a public URL).
let currentLogoSrc = null;

const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const BRAND = {
    purple: '#a855f7',
    pink: '#ec4899',
    navy: '#0b0f1a',
    text: '#0f172a',
    muted: '#64748b',
};

function layout({ preheader, heading, paragraphs = [], cta, footnote }) {
    const base = getAppBaseUrl();
    if (cta && !cta.url) cta = null; // never render a link without a configured app URL
    const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.text};">${esc(p)}</p>`).join('');
    const button = cta ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
          <tr><td style="border-radius:10px;background:${BRAND.purple};background-image:linear-gradient(135deg,${BRAND.purple},${BRAND.pink});">
            <a href="${esc(cta.url)}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(cta.label)}</a>
          </td></tr>
        </table>
        <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:${BRAND.muted};">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;color:${BRAND.purple};">${esc(cta.url)}</span></p>` : '';
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:Poppins,'Segoe UI',Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || '')}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ede9fe;">
        <tr><td style="background:${BRAND.purple};background-image:linear-gradient(135deg,${BRAND.purple},${BRAND.pink});padding:22px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            ${currentLogoSrc ? `<td style="padding-right:12px;vertical-align:middle;"><span style="display:inline-block;background:#ffffff;border-radius:12px;padding:4px;line-height:0;"><img src="${esc(currentLogoSrc)}" alt="Lumina logo" height="40" style="height:40px;width:auto;max-width:120px;display:block;border:0;"></span></td>` : ''}
            <td style="vertical-align:middle;"><span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">Lumina</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${BRAND.text};">${esc(heading)}</h1>
          ${body}${button}
          ${footnote ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted};">${esc(footnote)}</p>` : ''}
        </td></tr>
        <tr><td style="padding:16px 28px;background:#faf5ff;font-size:11px;line-height:1.5;color:${BRAND.muted};">
          Lumina · Supporting your mental wellness journey${base ? ` · <a href="${esc(base)}" style="color:${BRAND.purple};">${esc(base.replace(/^https?:\/\//, ''))}</a>` : ''}<br>
          If you are in immediate danger, call 112.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
    const text = [heading, '', ...paragraphs, cta ? `\n${cta.label}: ${cta.url}` : '', footnote ? `\n${footnote}` : '', '\n—\nLumina · If you are in immediate danger, call 112.']
        .filter((x) => x !== undefined).join('\n');
    return { html, text };
}

const TEMPLATES = {
    password_reset: ({ name, resetUrl, expiresMinutes }) => ({
        subject: 'Reset your Lumina password',
        ...layout({
            preheader: `This link expires in ${expiresMinutes} minutes.`,
            heading: 'Reset your password',
            paragraphs: [
                `Hi ${name || 'there'},`,
                'We received a request to reset the password for your Lumina account. Use the button below to choose a new password.',
                `For your security, this link can be used only once and expires in ${expiresMinutes} minutes.`,
            ],
            cta: { label: 'Reset password', url: resetUrl },
            footnote: 'Did not request this? You can safely ignore this email – your password will not change. Lumina will never ask for your password by email.',
        }),
    }),

    password_changed: ({ name, changedAt }) => ({
        subject: 'Your Lumina password was changed',
        ...layout({
            preheader: 'Security notice for your account.',
            heading: 'Your password was changed',
            paragraphs: [
                `Hi ${name || 'there'},`,
                `The password for your Lumina account was changed on ${changedAt}. For your security, you were signed out on all devices.`,
                'If this was you, no action is needed.',
            ],
            cta: { label: 'Sign in', url: appLink('/login') },
            footnote: 'If you did not make this change, reset your password immediately using "Forgot password" on the sign-in page.',
        }),
    }),

    // Deliberately discreet: no mention of what the reminder is about.
    checkin_reminder: ({ name }) => ({
        subject: 'Lumina: a gentle reminder',
        ...layout({
            preheader: 'Sign in when you have a moment.',
            heading: 'A gentle reminder',
            paragraphs: [`Hi ${name || 'there'},`, 'This is a gentle reminder from Lumina. Sign in when you have a moment.'],
            cta: { label: 'Open Lumina', url: appLink('/login') },
            footnote: 'You can change or turn off reminders in your Lumina settings at any time.',
        }),
    }),

    // Generic notification: the subject/body never contain the notification's content.
    notification: ({ name, audience, reference }) => ({
        subject: audience === 'staff' ? `Lumina: action needed${reference ? ` (${reference})` : ''}` : 'Lumina: you have a new update',
        ...layout({
            preheader: 'Sign in to view the details.',
            heading: audience === 'staff' ? 'A case needs your attention' : 'You have a new update',
            paragraphs: [
                `Hi ${name || 'there'},`,
                audience === 'staff'
                    ? `There is new activity${reference ? ` (${reference})` : ''} on a case assigned to you. Details are only available after signing in.`
                    : 'There is a new update waiting for you in Lumina. For your privacy, details are only shown after you sign in.',
            ],
            cta: { label: 'Sign in to Lumina', url: appLink('/login') },
            footnote: 'You receive these emails because email notifications are turned on in your profile.',
        }),
    }),

    test: ({ sentAt, provider }) => ({
        subject: 'Lumina email test',
        ...layout({
            preheader: 'Your email configuration works.',
            heading: 'Email configuration test',
            paragraphs: [
                `This is a test email sent by Lumina at ${sentAt} using the "${provider}" provider.`,
                'If you can read this, the provider accepted the message and it reached this inbox.',
            ],
        }),
    }),

    // Internal notification to the feedback inbox – contains no user name or email address.
    feedback: ({ feedbackId, rating, category, note, comments, related, submittedAt }) => ({
        subject: `Lumina feedback: ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} (${rating}/5) – ${category}`,
        ...layout({
            preheader: `${rating}/5 · ${category}`,
            heading: 'New feedback received',
            paragraphs: [
                `Rating: ${rating} out of 5`,
                `Category: ${category}`,
                `Feedback: ${note}`,
                ...(comments ? [`Additional comments: ${comments}`] : []),
                ...(related ? [`Related ${related.type}: ${related.label}`] : []),
                `Submitted: ${submittedAt}`,
                `Feedback ID: ${feedbackId}`,
            ],
            footnote: 'The submitter’s identity is not included in this email. Full details are in the Lumina admin dashboard.',
        }),
    }),
};

/**
 * Render a template. options.logoSrc: "cid:lumina-logo" (inline attachment) or a public https URL.
 */
function renderEmail(type, data, { logoSrc = null } = {}) {
    const render = TEMPLATES[type];
    if (!render) throw new Error(`Unknown email template: ${type}`);
    currentLogoSrc = logoSrc;
    try {
        return render(data || {});
    } finally {
        currentLogoSrc = null;
    }
}

module.exports = { renderEmail, esc };
