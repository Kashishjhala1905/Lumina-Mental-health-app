# Email, password reset, reminders & referrals

## 1. Email delivery

All email goes through `server/services/email/emailService.js`.

| Provider (`EMAIL_PROVIDER`) | Use | Notes |
|---|---|---|
| `resend` (recommended) | Production | HTTPS API with `Idempotency-Key`, so retries can never send twice. Needs `RESEND_API_KEY` and `EMAIL_FROM` on a domain verified in Resend. |
| `smtp` | Production alternative | Any SMTP server (Gmail app password, Brevo, SendGrid SMTP…). Needs `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`. |
| `outbox` | Local development only | Writes emails to `server/.dev-outbox/` (git-ignored) and **never sends**. Disabled when `NODE_ENV=production`. |
| `none` (default) | — | Emails are skipped and recorded as `skipped / not_configured`. |

Credentials live only in `server/.env`, never in `client/.env`.

**Delivery tracking (`EmailDelivery` collection).** There is one record per logical email, keyed by an idempotency key. No bodies, links or tokens are stored, and the recipient is masked and hashed.

| Status | Meaning |
|---|---|
| `accepted` | The provider accepted the message. **This is not proof of delivery.** |
| `delivered` / `bounced` / `complained` | Set only by a verified Resend webhook (`POST /api/email/webhooks/resend`, Svix signature, `RESEND_WEBHOOK_SECRET`). |
| `failed` | Recorded with an error code: `auth`, `rate_limited`, `provider_error`, `timeout`, `network`, `rejected`, `invalid_recipient`… |
| `captured` | Development outbox only. |
| `skipped` | No provider configured. |

**Retry rules.**
- Retried, up to `EMAIL_MAX_ATTEMPTS`: network errors, provider 429/5xx, and SMTP 421/45x before the message body is sent.
- Never retried: authentication and validation errors.
- SMTP errors after the message body was submitted are marked `uncertain` and not retried, to avoid duplicates. Resend timeouts are retried with the same idempotency key.

**Templates** (`services/email/templates.js`) use Lumina's purple-pink branding and are deliberately discreet. Reminder and notification emails never mention victim support, check-in answers or case details.

**Testing tools.**
- Admin → *Email & Reminders*: provider status and configuration issues, *Check connection* (SMTP login check), *Send test email*, *Run due reminders now*, and recent deliveries with masked recipients.
- CLI: `npm run email:test` (status + connection check), `npm run email:test -- you@example.com` (sends a test email and prints *accepted* vs *failed*), and `npm run reminders:run`.

## 2. Password reset

1. `POST /api/auth/forgot-password { email }` always returns the same neutral message. Work happens after the response, so timing doesn't reveal whether the account exists.
2. For a registered email: a 256-bit random token is created and only its SHA-256 hash is stored (`PasswordResetToken`). It expires in 15 minutes (`PASSWORD_RESET_TTL_MINUTES`). Older unused links are invalidated, and there are at most 3 requests per account per hour (silently).
3. The email link is `APP_BASE_URL/#/reset-password?token=…`. The page removes the token from the address bar and checks it with `POST /api/auth/reset-password/verify`.
4. `POST /api/auth/reset-password { token, password, confirmPassword }`:
   - The password policy is validated *before* the token is used, so a typo doesn't waste the link.
   - The token is consumed atomically (single use) and the password is hashed with bcrypt (12 rounds).
   - `tokenVersion` is incremented, which signs out every session, and the owner receives a "password changed" email.
5. Rate limits: `FORGOT_PASSWORD_RATE_LIMIT` (default 5 per 15 min per IP) and `RESET_PASSWORD_RATE_LIMIT`. Tokens and passwords are never logged or written to the audit log.

## 3. Check-in reminders

`ReminderPreference` holds the user's settings: enabled, frequency, preferred hour, IANA timezone, and in-app/email channels.

`ReminderEvent` tracks each reminder's lifecycle: **scheduled → sent | failed | skipped**. Each processed event keeps per-channel results (in-app sent/duplicate, email accepted/failed/not_configured/duplicate).

- **One central job** (`node-cron`, every 15 minutes), or `/api/internal/cron/reminders` on serverless hosts.
- **Consent** is re-checked at send time. Withdrawal cancels the scheduled event (`skipped / consent_withdrawn`) and pauses the preference.
- **Duplicates** are prevented by an atomic claim, one scheduled event per user, a per-user-per-local-day key, the notification's dedupe key, and the email idempotency key.
- **Other skip reasons:** `recent_checkin`, `disabled_by_user`, `duplicate`, `no_channel_available`.
- **Users see** their last 10 reminders under *Reminders & consent*.

## 4. Referrals

`Referral` records each referral to a support service: reference `RF-XXXXXX`, case, assigned counselor, category, title, description, organisation (from the directory or custom), status, follow-up date, a user-visible update, private notes (encrypted), status history, and timestamps.

**Statuses:** Suggested → Accepted → Referred → Follow-up Pending → **Completed** (requires a private confirmation note) or **Unable to Connect** (requires a private reason).

| Who | Can do / see |
|---|---|
| Assigned counselor | Create, update and add notes. Other counselors and admins get 403, and denials are audited. |
| User | `GET /api/victim-support/referrals` returns status, a plain-language status message, the counselor's user-facing update, the organisation's public contact details and the follow-up date. Never private notes, confirmation notes or internal reasons. |
| User | Can grant or withdraw *permission to share details* per referral. |

Also included: counselor dashboard counts (open referrals, follow-ups due), a referrals tab with filters, admin aggregate charts, and the data export and deletion workflows.

## 5. External integrations

**No official government or helpline API, and no authorised credentials, are available.** So:

- **Verified directory.** `server/config/supportDirectory.js` lists the official contact details with their source pages. They were checked against the official sites on 2026-10-31:

  | Service | Number | Verified on |
  |---|---|---|
  | National Helpline Against Atrocities | 14566 | socialjustice.gov.in |
  | Tele-MANAS | 14416 / 1-800-891-4416 | telemanas.mohfw.gov.in |
  | Women Helpline | 181 | wcd.gov.in |
  | Childline | 1098 | wcd.gov.in |
  | NALSA free legal aid | 15100 | nalsa.gov.in |
  | National Cyber Crime Helpline | 1930 | cybercrime.gov.in |
  | Emergency | 112 | **Not re-verified** – 112.gov.in was unreachable |

- **Labelled as not connected.** Every service shows "Not connected" in the counselor, admin and user views.
- **Integration seam.** `services/integrations/externalReferralService.js` is the single place to add an authorised integration later: an adapter with `isConfigured / buildPayload / submit`, built from the provider's published API documentation.
  - No adapters are registered.
  - `POST /api/counselor/referrals/:id/external-submit` returns `409 not_available` and is audited (`EXTERNAL_REFERRAL_ATTEMPT`), without transmitting anything.
  - Even with an adapter, submission requires the user's explicit permission, and only the minimum payload may be sent: never check-in answers, comments, AI analysis or notes.

## 6. New API endpoints

| Area | Endpoints |
|---|---|
| Password reset | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password/verify`, `POST /api/auth/reset-password` |
| Profile | `PATCH /api/auth/profile` now accepts `emailNotifications` (opt-in, discreet emails for important updates) |
| Admin | `GET /api/admin/email/status`, `POST /api/admin/email/verify`, `POST /api/admin/email/test`, `POST /api/admin/reminders/run`, `GET /api/admin/integrations` |
| Webhook | `POST /api/email/webhooks/resend` |
| Counselor | `GET /api/counselor/referral-directory`, `GET /api/counselor/referrals?status=|open&due=1`, `POST /api/counselor/cases/:caseRef/referrals`, `PATCH /api/counselor/referrals/:id`, `POST /api/counselor/referrals/:id/notes`, `POST /api/counselor/referrals/:id/external-submit` |
| User | `GET /api/victim-support/referrals`, `PATCH /api/victim-support/referrals/:ref/consent`; `GET /api/victim-support/reminders` now includes `recent` |

## 7. Going live with real email (checklist)

1. Create a Resend account, verify your sending domain (DNS records), and create an API key with *Sending access*.
2. In `server/.env`, set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=…`, `EMAIL_FROM="Lumina <no-reply@your-domain>"` and `APP_BASE_URL=https://your-app-url`.
3. Optional, for confirmed delivery: add a Resend webhook to `https://<api-host>/api/email/webhooks/resend` (email.delivered / bounced / complained) and set `RESEND_WEBHOOK_SECRET`.
4. Restart the server, then run `npm run email:test -- your@inbox` or use Admin → *Email & Reminders* → *Send test email*, and confirm the message arrived.

SMTP instead: set `EMAIL_PROVIDER=smtp` and the `SMTP_*` variables (Gmail needs 2-step verification plus an app password; port 587 with `SMTP_REQUIRE_TLS=true`, or 465 with `SMTP_SECURE=true`).
