// reminderService – schedules and processes check-in reminders with full lifecycle tracking.
// Called by ONE centralised scheduler (reminderScheduler.js); there are no per-user cron jobs.
//
// Lifecycle (ReminderEvent): scheduled → sent | failed | skipped
//   • exactly one "scheduled" event per user (partial unique index)
//   • duplicates prevented by an atomic claim on ReminderPreference.nextReminderAt, a per-user-per-local-day
//     dedupe key, Notification.dedupeKey and EmailDelivery.idempotencyKey
//   • consent is re-checked at send time; withdrawal cancels the scheduled reminder
const ReminderPreference = require('../models/ReminderPreference');
const ReminderEvent = require('../models/ReminderEvent');
const VictimSupportConsent = require('../models/VictimSupportConsent');
const User = require('../models/User');
const { atLocalHour, localDateKey, isValidTimeZone } = require('../utils/timezone');
const { notify } = require('./notificationService');
const { sendEmail, isEmailConfigured } = require('./email/emailService');
const { auditLog } = require('./auditService');

const DAY_MS = 24 * 60 * 60 * 1000;
const tzOf = (pref) => (isValidTimeZone(pref.timezone) ? pref.timezone : 'UTC');

/**
 * Next reminder time: `frequency` days after the reference point (last check-in or now),
 * at the preferred local hour. Never returns a time in the past.
 */
function computeNextReminder(pref, { lastCheckinAt, now = new Date() } = {}) {
    const tz = tzOf(pref);
    const days = ReminderPreference.FREQUENCIES[pref.frequency] || 3;
    const base = lastCheckinAt ? new Date(lastCheckinAt) : now;
    let next = atLocalHour(base, days, pref.preferredHour, tz);
    if (next <= now) {
        // Overdue – remind at the next occurrence of the preferred hour
        next = atLocalHour(now, 0, pref.preferredHour, tz);
        if (next <= now) next = atLocalHour(now, 1, pref.preferredHour, tz);
    }
    return next;
}

/** Marks the user's pending (scheduled) reminder as skipped with a reason. */
async function cancelScheduled(userId, reason) {
    await ReminderEvent.updateOne(
        { userId, status: 'scheduled' },
        { $set: { status: 'skipped', skipReason: reason, processedAt: new Date() } }
    );
}

/** Creates or moves the user's single scheduled reminder event. */
async function upsertScheduledEvent(pref, scheduledFor, caseRef) {
    try {
        await ReminderEvent.findOneAndUpdate(
            { userId: pref.userId, status: 'scheduled' },
            { $set: { scheduledFor, caseRef }, $setOnInsert: { userId: pref.userId, status: 'scheduled' } },
            { upsert: true, new: true }
        );
    } catch (err) {
        if (err.code !== 11000) throw err; // concurrent upsert – the other writer created it
    }
}

/**
 * Re-computes nextReminderAt and keeps the scheduled ReminderEvent in sync.
 * Disabled/paused preferences cancel any pending reminder.
 */
async function syncSchedule(pref, { lastCheckinAt, caseRef, cancelReason = 'disabled_by_user' } = {}) {
    if (!pref.enabled || pref.pausedReason) {
        pref.nextReminderAt = null;
        await pref.save();
        await cancelScheduled(pref.userId, pref.pausedReason === 'consent_withdrawn' ? 'consent_withdrawn' : cancelReason);
        return pref;
    }
    pref.nextReminderAt = computeNextReminder(pref, { lastCheckinAt });
    await pref.save();
    await upsertScheduledEvent(pref, pref.nextReminderAt, caseRef);
    return pref;
}

/** Re-schedule a user's reminder (after a check-in or a preference change). */
async function rescheduleForUser(userId, { lastCheckinAt } = {}) {
    const pref = await ReminderPreference.findOne({ userId });
    if (!pref || !pref.enabled) return pref;
    const consent = await VictimSupportConsent.findOne({ userId }).select('caseRef').lean();
    return syncSchedule(pref, { lastCheckinAt, caseRef: consent?.caseRef });
}

/** Pause reminders (consent withdrawal / data deletion) and cancel the pending one. */
async function pauseForUser(userId, reason = 'consent_withdrawn') {
    await ReminderPreference.updateOne(
        { userId },
        { $set: { enabled: false, pausedReason: reason === 'data_deleted' ? 'consent_withdrawn' : reason, nextReminderAt: null } }
    );
    await cancelScheduled(userId, reason);
}

async function finalize(event, fields) {
    Object.assign(event, fields, { processedAt: new Date() });
    try {
        await event.save();
    } catch (err) {
        if (err.code !== 11000) throw err;
        // dedupe key already used today by another event → this one is a duplicate
        event.dedupeKey = undefined;
        event.status = 'skipped';
        event.skipReason = 'duplicate';
        await event.save();
    }
    return event;
}

/**
 * Process all due reminders. Safe to run concurrently or manually (admin "run now").
 * @returns {Promise<{due, sent, failed, skipped, paused, emailed}>}
 */
async function processDueReminders(now = new Date()) {
    const due = await ReminderPreference.find({
        enabled: true,
        pausedReason: null,
        nextReminderAt: { $ne: null, $lte: now },
    }).limit(500).lean();

    const summary = { due: due.length, sent: 0, failed: 0, skipped: 0, paused: 0, emailed: 0 };

    for (const pref of due) {
        const consent = await VictimSupportConsent.findOne({ userId: pref.userId }).lean();
        if (!consent || consent.status !== 'active') {
            await pauseForUser(pref.userId, 'consent_withdrawn');
            summary.paused++;
            continue;
        }

        const next = computeNextReminder(pref, { lastCheckinAt: consent.lastCheckinAt, now: new Date(now.getTime() + 60 * 1000) });
        // Atomic claim: only the process that moves nextReminderAt handles this reminder
        const claimed = await ReminderPreference.findOneAndUpdate(
            { _id: pref._id, nextReminderAt: pref.nextReminderAt, enabled: true },
            { $set: { nextReminderAt: next, lastReminderAt: now } },
            { new: true }
        );
        if (!claimed) { summary.skipped++; continue; }

        const tz = tzOf(pref);
        const localDate = localDateKey(now, tz);
        let event = await ReminderEvent.findOne({ userId: pref.userId, status: 'scheduled' });
        if (!event) event = new ReminderEvent({ userId: pref.userId, scheduledFor: pref.nextReminderAt, status: 'scheduled' });
        event.caseRef = consent.caseRef;
        event.localDate = localDate;

        const days = ReminderPreference.FREQUENCIES[pref.frequency] || 3;
        if (consent.lastCheckinAt && now - new Date(consent.lastCheckinAt) < (days * DAY_MS) - (2 * 60 * 60 * 1000)) {
            await finalize(event, { status: 'skipped', skipReason: 'recent_checkin' });
            summary.skipped++;
        } else {
            const dedupeKey = `checkin_reminder:${pref.userId}:${localDate}`;
            const channels = { inApp: { status: 'disabled' }, email: { status: 'disabled' } };

            if (pref.channels?.inApp !== false) {
                const n = await notify(pref.userId, {
                    type: 'checkin_reminder',
                    title: 'Time for your well-being check-in',
                    message: 'A short check-in helps you and your counselor notice how things are going. Skip any question you prefer not to answer.',
                    link: '/victim-support/check-in',
                    dedupeKey,
                });
                channels.inApp = n ? { status: 'sent', notificationId: n._id } : { status: 'duplicate' };
            }

            if (pref.channels?.email) {
                if (!isEmailConfigured()) {
                    channels.email = { status: 'not_configured' };
                } else {
                    const user = await User.findById(pref.userId).select('name email').lean();
                    const r = await sendEmail({ to: user?.email, type: 'checkin_reminder', userId: pref.userId, idempotencyKey: dedupeKey, data: { name: user?.name } });
                    channels.email = { status: ['accepted', 'captured', 'duplicate', 'failed', 'skipped'].includes(r.status) ? r.status : 'failed', deliveryId: r.deliveryId, errorCode: r.errorCode };
                    if (['accepted', 'captured'].includes(r.status)) summary.emailed++;
                }
            }

            const delivered = channels.inApp.status === 'sent' || ['accepted', 'captured'].includes(channels.email.status);
            const anyFailed = channels.inApp.status === 'failed' || ['failed', 'not_configured'].includes(channels.email.status);
            const allDuplicate = [channels.inApp.status, channels.email.status].every((s) => ['duplicate', 'disabled'].includes(s))
                && [channels.inApp.status, channels.email.status].includes('duplicate');

            if (delivered) {
                await finalize(event, { status: 'sent', dedupeKey, channels });
                summary.sent++;
            } else if (allDuplicate) {
                await finalize(event, { status: 'skipped', skipReason: 'duplicate', channels });
                summary.skipped++;
            } else if (anyFailed) {
                await finalize(event, { status: 'failed', dedupeKey, channels });
                summary.failed++;
            } else {
                await finalize(event, { status: 'skipped', skipReason: 'no_channel_available', channels });
                summary.skipped++;
            }
            if (event.status === 'sent') {
                await auditLog({ action: 'REMINDER_SENT', targetUserId: pref.userId, caseRef: consent.caseRef, entityType: 'ReminderEvent', entityId: event._id, metadata: { inApp: channels.inApp.status, emailStatus: channels.email.status } });
            } else if (event.status === 'failed') {
                await auditLog({ action: 'REMINDER_FAILED', targetUserId: pref.userId, caseRef: consent.caseRef, entityType: 'ReminderEvent', entityId: event._id, metadata: { emailStatus: channels.email.status, errorCode: channels.email.errorCode } });
            }
        }

        // Schedule the following reminder
        await upsertScheduledEvent(claimed, next, consent.caseRef);
    }
    return summary;
}

/** Aggregate reminder statistics for the admin dashboard. */
async function reminderStats(sinceDays = 30) {
    const since = new Date(Date.now() - sinceDays * DAY_MS);
    const [byStatus, skipReasons, nextDue] = await Promise.all([
        ReminderEvent.aggregate([{ $match: { $or: [{ status: 'scheduled' }, { processedAt: { $gte: since } }] } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
        ReminderEvent.aggregate([{ $match: { status: 'skipped', processedAt: { $gte: since } } }, { $group: { _id: '$skipReason', n: { $sum: 1 } } }]),
        ReminderEvent.findOne({ status: 'scheduled' }).sort({ scheduledFor: 1 }).select('scheduledFor').lean(),
    ]);
    return {
        sinceDays,
        byStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.n])),
        skipReasons: Object.fromEntries(skipReasons.map((r) => [r._id || 'unknown', r.n])),
        nextDueAt: nextDue?.scheduledFor || null,
    };
}

module.exports = { computeNextReminder, syncSchedule, rescheduleForUser, pauseForUser, cancelScheduled, processDueReminders, reminderStats };
