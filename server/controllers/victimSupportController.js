// Confidential Victim Support – user-facing endpoints (consent, check-ins, dashboard, reminders, data rights).
// Every query is scoped to req.user._id, so users can only ever read their own records.
const VictimSupportConsent = require('../models/VictimSupportConsent');
const WellbeingCheckin = require('../models/WellbeingCheckin');
const DistressAssessment = require('../models/DistressAssessment');
const RiskAlert = require('../models/RiskAlert');
const SupportPlan = require('../models/SupportPlan');
const ReminderPreference = require('../models/ReminderPreference');
const { generateCaseRef, ensureAssignment } = require('../services/caseService');
const { parseCheckinInput, submitCheckin } = require('../services/checkinService');
const { syncSchedule, pauseForUser } = require('../services/reminderService');
const { deleteVictimSupportData } = require('../services/victimDataService');
const { auditLog } = require('../services/auditService');
const { isEmailConfigured } = require('../services/email/emailService');
const ReminderEvent = require('../models/ReminderEvent');
const Referral = require('../models/Referral');
const { getRules } = require('../services/distressScoreService');
const { isValidTimeZone } = require('../utils/timezone');
const S = require('../services/vsSerializers');

const REQUIRED_ACKS = ['dataCollection', 'dataUsage', 'authorizedAccess', 'notEmergencyService', 'prototypeNotice'];
const cleanDistrict = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 80) : '');

const loadConsent = (userId) => VictimSupportConsent.findOne({ userId }).populate('assignedCounselor', 'name');

/** Middleware: monitoring features require active consent. */
const requireActiveConsent = async (req, res, next) => {
    const consent = await VictimSupportConsent.findOne({ userId: req.user._id });
    if (!consent || consent.status !== 'active') {
        return res.status(403).json({ success: false, code: 'CONSENT_REQUIRED', message: 'Please review and accept the consent information before using monitoring features.' });
    }
    req.vsConsent = consent;
    next();
};

// GET /api/victim-support/consent
const getConsent = async (req, res) => {
    const consent = await loadConsent(req.user._id);
    res.json({
        success: true,
        data: {
            consent: S.consentForOwner(consent),
            currentConsentVersion: VictimSupportConsent.CONSENT_VERSION,
            ruleVersion: getRules().ruleVersion,
        },
    });
};

// POST /api/victim-support/consent
const grantConsent = async (req, res) => {
    const acks = req.body.acknowledgements || {};
    const missing = REQUIRED_ACKS.filter((k) => acks[k] !== true);
    if (missing.length) {
        return res.status(400).json({ success: false, message: 'Please read and confirm every consent statement to continue.', errors: { acknowledgements: missing } });
    }

    let consent = await VictimSupportConsent.findOne({ userId: req.user._id });
    if (consent && consent.status === 'active') {
        return res.status(409).json({ success: false, message: 'Consent is already active.' });
    }

    const now = new Date();
    const fields = {
        status: 'active',
        consentVersion: VictimSupportConsent.CONSENT_VERSION,
        acknowledgements: Object.fromEntries(REQUIRED_ACKS.map((k) => [k, true])),
        allowAiAnalysis: req.body.allowAiAnalysis !== false,
        district: cleanDistrict(req.body.district) || undefined,
        grantedAt: now,
        withdrawnAt: undefined,
        withdrawalDataChoice: undefined,
    };
    if (consent) {
        Object.assign(consent, fields);
        consent.history.push({ action: 'granted', at: now, consentVersion: fields.consentVersion });
    } else {
        consent = new VictimSupportConsent({
            ...fields,
            userId: req.user._id,
            caseRef: await generateCaseRef(),
            history: [{ action: 'granted', at: now, consentVersion: fields.consentVersion }],
        });
    }
    await consent.save();

    await auditLog({
        action: 'CONSENT_GRANTED',
        actor: req.user,
        targetUserId: req.user._id,
        caseRef: consent.caseRef,
        entityType: 'VictimSupportConsent',
        entityId: consent._id,
        metadata: { consentVersion: consent.consentVersion, allowAiAnalysis: consent.allowAiAnalysis, districtProvided: !!consent.district },
    });

    await ensureAssignment(consent);

    if (req.body.enableReminders) {
        const pref = await ReminderPreference.findOneAndUpdate(
            { userId: req.user._id },
            { $setOnInsert: { userId: req.user._id }, $set: { enabled: true, pausedReason: null } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        if (req.body.timezone && isValidTimeZone(req.body.timezone)) pref.timezone = req.body.timezone;
        await syncSchedule(pref, { lastCheckinAt: consent.lastCheckinAt, caseRef: consent.caseRef });
        await auditLog({ action: 'REMINDER_PREFERENCES_UPDATED', actor: req.user, targetUserId: req.user._id, caseRef: consent.caseRef, metadata: { enabled: true, frequency: pref.frequency } });
    } else {
        // Re-consenting after withdrawal keeps reminders off until the user turns them on again
        await ReminderPreference.updateOne({ userId: req.user._id }, { $set: { pausedReason: null } });
    }

    const fresh = await loadConsent(req.user._id);
    res.status(201).json({ success: true, message: 'Consent recorded. Monitoring is now active.', data: { consent: S.consentForOwner(fresh) } });
};

// PATCH /api/victim-support/consent/preferences
const updateConsentPreferences = async (req, res) => {
    const consent = req.vsConsent;
    const changes = {};
    if (typeof req.body.allowAiAnalysis === 'boolean') { consent.allowAiAnalysis = req.body.allowAiAnalysis; changes.allowAiAnalysis = req.body.allowAiAnalysis; }
    if (req.body.district !== undefined) { consent.district = cleanDistrict(req.body.district) || undefined; changes.districtProvided = !!consent.district; }
    if (!Object.keys(changes).length) return res.status(400).json({ success: false, message: 'No valid preference changes supplied' });
    consent.history.push({ action: 'preferences_updated', at: new Date(), consentVersion: consent.consentVersion });
    await consent.save();
    await auditLog({ action: 'CONSENT_PREFERENCES_UPDATED', actor: req.user, targetUserId: req.user._id, caseRef: consent.caseRef, entityType: 'VictimSupportConsent', entityId: consent._id, metadata: changes });
    const fresh = await loadConsent(req.user._id);
    res.json({ success: true, message: 'Preferences updated', data: { consent: S.consentForOwner(fresh) } });
};

// POST /api/victim-support/consent/withdraw   { dataChoice: 'retain' | 'delete' }
const withdrawConsent = async (req, res) => {
    const dataChoice = req.body.dataChoice;
    if (!['retain', 'delete'].includes(dataChoice)) {
        return res.status(400).json({ success: false, message: 'Please choose whether to keep or delete your existing data.' });
    }
    const consent = await VictimSupportConsent.findOne({ userId: req.user._id });
    if (!consent || consent.status !== 'active') {
        return res.status(409).json({ success: false, message: 'There is no active consent to withdraw.' });
    }

    const now = new Date();
    consent.status = 'withdrawn';
    consent.withdrawnAt = now;
    consent.withdrawalDataChoice = dataChoice;
    consent.history.push({ action: 'withdrawn', at: now, consentVersion: consent.consentVersion });
    await consent.save();

    // Stop future monitoring: reminders paused; check-ins and AI processing are blocked by requireActiveConsent.
    await pauseForUser(req.user._id, 'consent_withdrawn');

    await auditLog({
        action: 'CONSENT_WITHDRAWN',
        actor: req.user,
        targetUserId: req.user._id,
        caseRef: consent.caseRef,
        entityType: 'VictimSupportConsent',
        entityId: consent._id,
        metadata: { dataChoice },
    });

    let deleted = null;
    if (dataChoice === 'delete') {
        deleted = await deleteVictimSupportData(req.user._id, { actor: req.user, reason: 'consent_withdrawn' });
    }

    const retentionDays = parseInt(process.env.VS_RETENTION_DAYS, 10) || 365;
    const fresh = await loadConsent(req.user._id);
    res.json({
        success: true,
        message: dataChoice === 'delete'
            ? 'Consent withdrawn and your victim-support data has been deleted.'
            : `Consent withdrawn. Monitoring and reminders have stopped. Your existing records are kept read-only for up to ${retentionDays} days unless you delete them sooner.`,
        data: { consent: S.consentForOwner(fresh), deleted },
    });
};

// DELETE /api/victim-support/data   { confirm: 'DELETE' }
const deleteMyData = async (req, res) => {
    if (req.body?.confirm !== 'DELETE') {
        return res.status(400).json({ success: false, message: 'Type DELETE to confirm permanent deletion.' });
    }
    const consent = await VictimSupportConsent.findOne({ userId: req.user._id });
    if (!consent) return res.status(404).json({ success: false, message: 'No victim-support records found.' });
    if (consent.status === 'active') {
        return res.status(409).json({ success: false, message: 'Please withdraw consent before deleting your data.' });
    }
    const deleted = await deleteVictimSupportData(req.user._id, { actor: req.user, reason: 'user_request' });
    res.json({ success: true, message: 'Your victim-support data has been permanently deleted.', data: { deleted } });
};

// GET /api/victim-support/export – the user's own data (excludes counselor-private notes)
const exportMyData = async (req, res) => {
    const consent = await loadConsent(req.user._id);
    if (!consent) return res.status(404).json({ success: false, message: 'No victim-support records found.' });
    const [checkins, assessments, alerts, plans, referrals] = await Promise.all([
        WellbeingCheckin.find({ userId: req.user._id }).sort({ createdAt: 1 }).lean(),
        DistressAssessment.find({ userId: req.user._id }).sort({ createdAt: 1 }).lean(),
        RiskAlert.find({ userId: req.user._id }).sort({ createdAt: 1 }).lean(),
        SupportPlan.find({ userId: req.user._id }).populate('counselorId', 'name').lean(),
        Referral.find({ userId: req.user._id }).lean(),
    ]);
    await auditLog({ action: 'VS_DATA_EXPORTED', actor: req.user, targetUserId: req.user._id, caseRef: consent.caseRef });
    res.json({
        success: true,
        data: {
            exportedAt: new Date(),
            consent: S.consentForOwner(consent),
            checkins: checkins.map(S.checkinForOwner),
            assessments: assessments.map(S.assessmentForOwner),
            alerts: alerts.map(S.alertForOwner),
            supportPlans: plans.map(S.planForOwner),
            referrals: referrals.map(require('./referralController').referralForUser),
        },
    });
};

// POST /api/victim-support/checkins
const createCheckin = async (req, res) => {
    const { values, errors } = parseCheckinInput(req.body);
    if (Object.keys(errors).length) {
        return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
    }

    const { checkin, assessment, alertResult } = await submitCheckin({ user: req.user, consent: req.vsConsent, values });

    const showUrgentResources = assessment.category === 'Urgent Support Needed'
        || values.safetyConcern === 'unsafe'
        || assessment.crisisLanguageDetected;

    let reviewMessage = 'Thank you for checking in. Your responses have been saved.';
    if (alertResult.action !== 'none') {
        reviewMessage = alertResult.alert?.assignedCounselor
            ? 'Your check-in has been flagged for review by your assigned counselor.'
            : 'Your check-in has been flagged for counselor review. A counselor will be assigned as soon as one is available.';
    }

    res.status(201).json({
        success: true,
        message: reviewMessage,
        data: {
            checkin: S.checkinForOwner(checkin),
            assessment: S.assessmentForOwner(assessment),
            alert: alertResult.alert ? S.alertForOwner(alertResult.alert) : null,
            alertAction: alertResult.action,
            showUrgentResources,
        },
    });
};

// GET /api/victim-support/checkins?page=&limit=
const listCheckins = async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const filter = { userId: req.user._id };
    const [total, checkins] = await Promise.all([
        WellbeingCheckin.countDocuments(filter),
        WellbeingCheckin.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    const assessments = await DistressAssessment.find({ checkinId: { $in: checkins.map((c) => c._id) }, userId: req.user._id }).lean();
    const byCheckin = new Map(assessments.map((a) => [String(a.checkinId), a]));
    res.json({
        success: true,
        data: checkins.map((c) => ({ ...S.checkinForOwner(c), assessment: S.assessmentForOwner(byCheckin.get(String(c._id))) })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
};

// GET /api/victim-support/checkins/:id
const getCheckin = async (req, res) => {
    const checkin = await WellbeingCheckin.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!checkin) return res.status(404).json({ success: false, message: 'Check-in not found' });
    const assessment = await DistressAssessment.findOne({ checkinId: checkin._id, userId: req.user._id }).lean();
    res.json({ success: true, data: { ...S.checkinForOwner(checkin), assessment: S.assessmentForOwner(assessment) } });
};

// GET /api/victim-support/dashboard
const getDashboard = async (req, res) => {
    const consent = await loadConsent(req.user._id);
    if (!consent) {
        return res.json({ success: true, data: { consent: null } });
    }
    const userId = req.user._id;
    const [checkins, assessments, alerts, plans, reminder, referrals] = await Promise.all([
        WellbeingCheckin.find({ userId }).sort({ createdAt: -1 }).limit(60).lean(),
        DistressAssessment.find({ userId }).sort({ createdAt: -1 }).limit(60).lean(),
        RiskAlert.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
        SupportPlan.find({ userId, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).populate('counselorId', 'name').lean(),
        ReminderPreference.findOne({ userId }).lean(),
        Referral.find({ userId }).sort({ createdAt: -1 }).lean(),
    ]);
    const byCheckin = new Map(assessments.map((a) => [String(a.checkinId), a]));

    const trends = [...checkins].reverse().map((c) => {
        const a = byCheckin.get(String(c._id));
        return {
            checkinId: String(c._id),
            date: c.createdAt,
            emotionalState: c.emotionalState,
            stressLevel: c.stressLevel,
            anxietyLevel: c.anxietyLevel,
            sleepQuality: c.sleepQuality,
            dailyFunctioning: c.dailyFunctioning,
            score: a?.score ?? null,
            category: a?.category ?? null,
            isSynthetic: !!c.isSynthetic,
        };
    });

    const latest = assessments[0];
    const categoryCounts = assessments.reduce((acc, a) => ({ ...acc, [a.category]: (acc[a.category] || 0) + 1 }), {});

    res.json({
        success: true,
        data: {
            consent: S.consentForOwner(consent),
            summary: {
                totalCheckins: await WellbeingCheckin.countDocuments({ userId }),
                latestAssessment: latest ? S.assessmentForOwner(latest) : null,
                openAlert: alerts.find((a) => a.isOpen) ? S.alertForOwner(alerts.find((a) => a.isOpen)) : null,
                categoryCounts,
                supportRequests: checkins.filter((c) => c.requestCounselorContact).length,
                hasSyntheticData: checkins.some((c) => c.isSynthetic),
            },
            trends,
            recentCheckins: checkins.slice(0, 5).map((c) => ({ ...S.checkinForOwner(c), assessment: S.assessmentForOwner(byCheckin.get(String(c._id))) })),
            alerts: alerts.map(S.alertForOwner),
            supportPlans: plans.map(S.planForOwner),
            referrals: referrals.map(require('./referralController').referralForUser),
            reminder: reminder ? serializeReminder(reminder) : null,
        },
    });
};

const serializeReminder = (p) => ({
    enabled: p.enabled,
    frequency: p.frequency,
    preferredHour: p.preferredHour,
    timezone: p.timezone,
    channels: { inApp: p.channels?.inApp !== false, email: !!p.channels?.email },
    nextReminderAt: p.nextReminderAt,
    lastReminderAt: p.lastReminderAt,
    pausedReason: p.pausedReason,
});

const serializeReminderEvent = (e) => ({
    _id: e._id,
    scheduledFor: e.scheduledFor,
    status: e.status,
    skipReason: e.skipReason,
    channels: { inApp: e.channels?.inApp?.status || null, email: e.channels?.email?.status || null },
    processedAt: e.processedAt,
});

// GET /api/victim-support/reminders
const getReminderPreference = async (req, res) => {
    const [pref, recent] = await Promise.all([
        ReminderPreference.findOne({ userId: req.user._id }).lean(),
        ReminderEvent.find({ userId: req.user._id }).sort({ scheduledFor: -1 }).limit(10).lean(),
    ]);
    res.json({
        recent: recent.map(serializeReminderEvent),
        success: true,
        data: pref ? serializeReminder(pref) : serializeReminder({ enabled: false, frequency: 'every_3_days', preferredHour: 10, timezone: 'Asia/Kolkata', channels: { inApp: true, email: false } }),
        emailAvailable: isEmailConfigured(),
        frequencies: Object.keys(ReminderPreference.FREQUENCIES),
    });
};

// PUT /api/victim-support/reminders
const updateReminderPreference = async (req, res) => {
    const consent = await VictimSupportConsent.findOne({ userId: req.user._id }).lean();
    const errors = {};
    const update = {};
    const { enabled, frequency, preferredHour, timezone, channels } = req.body;

    if (enabled !== undefined) {
        if (typeof enabled !== 'boolean') errors.enabled = 'enabled must be true or false';
        else if (enabled && consent?.status !== 'active') errors.enabled = 'Reminders can only be enabled while consent is active';
        else update.enabled = enabled;
    }
    if (frequency !== undefined) {
        if (!Object.keys(ReminderPreference.FREQUENCIES).includes(frequency)) errors.frequency = 'Invalid frequency';
        else update.frequency = frequency;
    }
    if (preferredHour !== undefined) {
        const h = Number(preferredHour);
        if (!Number.isInteger(h) || h < 0 || h > 23) errors.preferredHour = 'Hour must be between 0 and 23';
        else update.preferredHour = h;
    }
    if (timezone !== undefined) {
        if (!isValidTimeZone(timezone)) errors.timezone = 'Unknown timezone';
        else update.timezone = timezone;
    }
    if (channels !== undefined) {
        if (typeof channels !== 'object' || channels === null) errors.channels = 'Invalid channels';
        else {
            if (typeof channels.inApp === 'boolean') update['channels.inApp'] = channels.inApp;
            if (typeof channels.email === 'boolean') {
                if (channels.email && !isEmailConfigured()) errors.channels = 'Email reminders are not available on this server';
                else update['channels.email'] = channels.email;
            }
        }
    }
    if (Object.keys(errors).length) return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });

    const pref = await ReminderPreference.findOneAndUpdate(
        { userId: req.user._id },
        { $set: { ...update, ...(update.enabled ? { pausedReason: null } : {}) }, $setOnInsert: { userId: req.user._id } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await syncSchedule(pref, { lastCheckinAt: consent?.lastCheckinAt, caseRef: consent?.caseRef, cancelReason: 'disabled_by_user' });

    await auditLog({
        action: 'REMINDER_PREFERENCES_UPDATED',
        actor: req.user,
        targetUserId: req.user._id,
        caseRef: consent?.caseRef,
        entityType: 'ReminderPreference',
        entityId: pref._id,
        metadata: { enabled: pref.enabled, frequency: pref.frequency, preferredHour: pref.preferredHour, timezone: pref.timezone },
    });
    res.json({ success: true, message: pref.enabled ? 'Reminder settings saved' : 'Reminders turned off', data: serializeReminder(pref) });
};

module.exports = {
    requireActiveConsent,
    getConsent,
    grantConsent,
    updateConsentPreferences,
    withdrawConsent,
    deleteMyData,
    exportMyData,
    createCheckin,
    listCheckins,
    getCheckin,
    getDashboard,
    getReminderPreference,
    updateReminderPreference,
};
