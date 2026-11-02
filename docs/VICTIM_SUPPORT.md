# Confidential Victim Support — technical guide

Inspired by **SIH PS 26094 – AI-Powered Dynamic Mental Health Monitoring and Distress Prediction System for Victims of Atrocities**.

> **Prototype notice.** The monitoring score is a transparent, rule-based indicator that helps trained people prioritise support. It is not a clinically validated diagnostic or prediction tool. Alerts are reviewed by humans; Lumina never contacts law enforcement or any external authority. Helpline numbers are shown for information only.

---

## 1. How the pieces fit

```
User ──consent──▶ VictimSupportConsent (caseRef VS-XXXXXX, assigned counselor)
  │
  └─check-in──▶ WellbeingCheckin ──▶ distressScoreService (rules JSON, no AI input)
                       │                     │
                       │                     └─▶ DistressAssessment (score, category, factors, trend, explanation)
                       └─optional comment──▶ aiAnalysisService (Groq JSON, advisory)  ──┘
                                                     │
                                  alertEngineService ┴─▶ RiskAlert (one open alert per user, merged triggers)
                                                     └─▶ Notification to assigned counselor
Counselor ──▶ case review · alert status · private notes · follow-ups · SupportPlan
Admin ──▶ aggregate analytics (k-anonymised) · pseudonymous case assignment · audit log
Scheduler (node-cron, single job) ──▶ ReminderPreference ──▶ Notification (+ optional email)
Every important action ──▶ AuditEvent (metadata only)
```

Code map (server):

| Area | Files |
|---|---|
| Models | `models/VictimSupportConsent.js`, `WellbeingCheckin.js`, `DistressAssessment.js`, `RiskAlert.js`, `SupportPlan.js`, `CaseNote.js`, `ReminderPreference.js`, `Notification.js`, `AuditEvent.js` |
| Scoring rules | `config/distressRules.json`, `services/distressScoreService.js` |
| AI | `config/ai.js`, `services/aiAnalysisService.js` |
| Alerts / cases | `services/alertEngineService.js`, `services/caseService.js` |
| Check-in pipeline | `services/checkinService.js` |
| Reminders | `services/reminderService.js`, `services/reminderScheduler.js`, `utils/timezone.js` |
| Privacy | `services/victimDataService.js` (deletion, retention), `utils/fieldCrypto.js` (AES-256-GCM), `services/vsSerializers.js` (role-specific views) |
| Audit | `services/auditService.js` |
| Routes | `routes/victimSupportRoutes.js`, `routes/counselorRoutes.js`, `routes/adminRoutes.js`, `routes/notificationRoutes.js`, `routes/internalRoutes.js` |

Client pages: `pages/VictimSupport.jsx` (landing), `VictimConsent.jsx`, `VictimCheckin.jsx`, `VictimDashboard.jsx`, `CounselorDashboard.jsx`, `CounselorCase.jsx`, `components/admin/VictimSupportAdmin.jsx` (analytics, assignment, audit), charts in `components/charts/`.

---

## 2. Explainable monitoring score (rule version 2.0.0)

All weights live in `server/config/distressRules.json`; change them there and bump `ruleVersion`.

| Factor | Points |
|---|---|
| Emotional state (1 = very low … 5 = very good) | 4 per step below 5 (max 16) |
| Stress, anxiety (1 = none … 5 = extreme) | 4 per step above 1 (max 16 each) |
| Sleep quality, daily functioning (5 = best) | 3 per step below 5 (max 12 each) |
| Social support | none +8 · some +3 |
| Safety | somewhat unsafe +12 · unsafe +25 |
| Needs professional help | yes +6 · unsure +3 |
| Requested counselor contact | +4 |
| Deterioration (answers ≥ 15 points above the average of the last 3 check-ins) | +8 |
| Sustained concern (previous 2 check-ins High or Urgent) | +5 |

Score is capped at 100. Categories: **Low** < 25 ≤ **Moderate** < 50 ≤ **High** < 70 ≤ **Urgent Support Needed**.

Overrides (minimum category): feeling **unsafe** → Urgent; **somewhat unsafe** → Moderate; **crisis wording** in the comment (deterministic phrase list, works without AI) → High.

Skipped questions score 0 and are reported in the explanation. AI output is never an input to the score or category.

## 3. AI analysis (Groq)

- Model: `GROQ_ANALYSIS_MODEL` → `GROQ_MODEL` → default `openai/gpt-oss-120b` (JSON mode, low reasoning effort).
- The comment is passed as delimited data; the prompt forbids diagnosis.
- Output is validated: lists are trimmed, confidence is normalised, and **evidence excerpts that do not literally appear in the comment are discarded** (and noted as uncertainty).
- Timeouts, 401/404/429/5xx, invalid JSON → `status: "unavailable"` with a reason; the check-in is still saved and scored.
- Users can opt out of AI processing (consent preference); withdrawing consent stops all future processing.
- An AI "human review recommended" flag with **high** confidence can add an *advisory* alert trigger (configurable), but never changes the category.

## 4. Alerts

Triggers (configurable in `alerts` section): category ≥ High, significant deterioration, explicit counselor-contact request, safety concern (unsafe / somewhat unsafe), crisis wording, AI advisory review flag.

Duplicate prevention: at most **one open alert per user** (partial unique index `one_open_alert_per_user`); new triggers are merged (occurrences, latest score, escalated category/priority, `hasNewActivity`). A check-in is never processed twice.

Statuses: New → Under Review → Contact Initiated → Resolved (re-opening allowed if no other open alert). Every change is recorded in `statusHistory` and the audit log. Users see status and reasons, never the counselor's private notes.

## 5. Privacy & security

- **Auth**: JWT in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production); 12 h session or 7 days with "remember me"; `tokenVersion` revokes all sessions on password change / "sign out everywhere" / role change. Bearer tokens are also accepted for API clients.
- **CSRF**: cookie-authenticated write requests must come from an allow-listed Origin (`CLIENT_URL`) or the API host.
- **Roles**: `user` (legacy `student` accepted), `counselor` (admin-approved), `admin`. Enforced on every API route; counselor case access additionally requires assignment (`CASE_ACCESS_DENIED` is audited). Admins see only pseudonymous case references and aggregates.
- **Encryption at rest** (`DATA_ENCRYPTION_KEY`, AES-256-GCM): check-in comments, AI evidence/summary, alert review notes, case notes, support-plan private notes.
- **Rate limiting**: global API, login (per IP + identifier, 10 failures / 15 min), registration, chatbot, check-ins.
- **Input hardening**: Mongo operator stripping, field whitelisting, express-validator-style manual validation, 100 kB JSON limit, helmet headers, safe error responses.
- **Audit log**: consent granted/withdrawn, check-in, score generation, alert created/updated/status changed, counselor assignment, case access (and denials), notes/follow-ups (no content), support plans, role changes, counselor approvals, data export/deletion, reminders, analytics views. Sensitive keys (passwords, comments, notes, content, email…) are stripped from metadata automatically.
- **Retention**: on withdrawal the user chooses *keep (read-only)* or *delete now*; kept data is purged after `VS_RETENTION_DAYS` (default 365) by the scheduler. Users can export (JSON) or delete their data at any time after withdrawal.
- General AI chat conversations are not stored and are never shared with counselors or admins.

## 6. API reference (all under `/api`)

**Auth** – `POST /auth/register` · `POST /auth/login` (`identifier` = username or email) · `POST /auth/logout` (`everywhere`) · `GET /auth/me` · `PATCH /auth/profile` · `PATCH /auth/password` · `GET /auth/counselors`

**Victim support (role user)** – `GET|POST /victim-support/consent` · `PATCH /victim-support/consent/preferences` · `POST /victim-support/consent/withdraw` (`dataChoice: retain|delete`) · `GET /victim-support/dashboard` · `GET|POST /victim-support/checkins` · `GET /victim-support/checkins/:id` · `GET|PUT /victim-support/reminders` · `GET /victim-support/export` · `DELETE /victim-support/data` (`confirm: "DELETE"`)

**Counselor (approved counselor, assigned cases only)** – `GET /counselor/dashboard` · `GET /counselor/cases` · `GET /counselor/cases/:caseRef` · `POST /counselor/cases/:caseRef/notes` · `PATCH /counselor/cases/:caseRef/notes/:noteId` · `POST /counselor/cases/:caseRef/support-plans` · `GET /counselor/alerts` · `PATCH /counselor/alerts/:id/status` · `POST /counselor/alerts/:id/notes` · `GET /counselor/support-plans` · `PATCH /counselor/support-plans/:id` · `POST /counselor/support-plans/:id/items` · `PATCH /counselor/support-plans/:id/items/:itemId`

**Admin** – existing: `GET /admin/users`, `GET /admin/appointments`, `DELETE /admin/user/:id`, `GET /admin/stats`, `GET /admin/pending-counselors`, `PATCH /admin/approve-counselor/:id`, `DELETE /admin/reject-counselor/:id` (now rejects without deleting) · new: `PATCH /admin/users/:id/role` · `GET /admin/analytics?from&to&district` · `GET /admin/vs/cases` · `PATCH /admin/vs/cases/:caseRef/assign` · `GET /admin/audit?action&caseRef&page`

**Notifications** – `GET /notifications` · `PATCH /notifications/read-all` · `PATCH /notifications/:id/read`

**Serverless cron** – `GET /internal/cron/reminders`, `GET /internal/cron/retention` (header `Authorization: Bearer <CRON_SECRET>`; disabled when `CRON_SECRET` is unset)

**Health** – `GET /health`

## 7. SIH demonstration script (synthetic data only)

Preparation:
```bash
cd server && npm run seed      # demo accounts + 10 synthetic cases in "Demo District A/B"
npm run dev                    # backend
cd ../client && npm run dev    # frontend → http://localhost:5173
```
Accounts (password `LuminaDemo#2026` unless `DEMO_PASSWORD` is set): `demo_user`, `demo_counselor`, `demo_admin`. Everything created by the seed is labelled *Synthetic*.

1. **Sign up** a new user at *Sign up* (Full Name, Username, Email, Password, Confirm) – or use `demo_user`.
2. **Log in** with the username, log out, log in again with the email.
3. Open **Victim Support** in the navbar → *Read consent information*.
4. Tick the five consent statements (optionally keep AI analysis and reminders on, add a district) → *I agree*.
5. Submit a **baseline check-in**, then a second one with low mood, high stress/anxiety, "somewhat unsafe", *I would like a counselor to contact me*, and a short comment (e.g. "I am scared at night and cannot sleep").
6. The result page shows the **AI-analysed comment** (advisory), and
7. the **explainable score**: category, previous category, contributing factors, trend, rule version and recommended step;
8. plus the **alert** reference – the user's dashboard shows it as *New*.
9. Log in as `demo_counselor` → bell notification + **Counselor Dashboard** (new / high-priority alerts).
10. Open the case → read check-ins, AI evidence and uncertainty, trends; set the alert to *Under Review* with a private note; add a follow-up.
11. *Support plans* → create a plan (e.g. counseling + legal-aid information referral). Try marking the legal item *Completed* without confirmation – it is refused.
12. Log in as `demo_admin` → *Victim Support Analytics* (filters, monthly trends, alerts by category, district table with suppression) and *Case Assignment* (pseudonymous).
13. *Audit Log* → filter by the case reference to show consent, check-in, score, alert, assignment, case access and plan events.

Optional: as the user, *Reminders & consent* → withdraw consent (keep or delete) to show that monitoring and reminders stop.

Simulated parts: helpline numbers are informational, support-plan referrals are records only, and no government portal or helpline is integrated.
