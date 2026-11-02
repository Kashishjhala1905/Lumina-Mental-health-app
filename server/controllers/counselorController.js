// Counselor dashboard – only cases ASSIGNED to the signed-in counselor are ever returned.
const mongoose = require('mongoose');
const VictimSupportConsent = require('../models/VictimSupportConsent');
const WellbeingCheckin = require('../models/WellbeingCheckin');
const DistressAssessment = require('../models/DistressAssessment');
const RiskAlert = require('../models/RiskAlert');
const SupportPlan = require('../models/SupportPlan');
const CaseNote = require('../models/CaseNote');
const AuditEvent = require('../models/AuditEvent');
const Referral = require('../models/Referral');
const { auditLog } = require('../services/auditService');
const { notify } = require('../services/notificationService');
const { encryptText } = require('../utils/fieldCrypto');
const S = require('../services/vsSerializers');

const { STATUSES: ALERT_STATUSES } = RiskAlert;
const { SUPPORT_CATEGORIES, ITEM_STATUSES, EXTERNAL_CATEGORIES } = SupportPlan;
const isObjectId = (v) => mongoose.isValidObjectId(v);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Loads a case only if it is assigned to this counselor; logs and rejects otherwise. */
async function loadAssignedCase(req, res, caseRef) {
    const consent = await VictimSupportConsent.findOne({ caseRef: String(caseRef || '').toUpperCase() })
        .populate('userId', 'name email username');
    if (!consent || String(consent.assignedCounselor) !== String(req.user._id)) {
        await auditLog({ action: 'CASE_ACCESS_DENIED', actor: req.user, caseRef: String(caseRef).slice(0, 20), metadata: { reason: consent ? 'not_assigned' : 'not_found' } });
        res.status(consent ? 403 : 404).json({ success: false, message: consent ? 'You are not assigned to this case' : 'Case not found' });
        return null;
    }
    return consent;
}

async function loadAssignedAlert(req, res) {
    if (!isObjectId(req.params.id)) { res.status(400).json({ success: false, message: 'Invalid alert id' }); return null; }
    const alert = await RiskAlert.findById(req.params.id);
    if (!alert || String(alert.assignedCounselor) !== String(req.user._id)) {
        await auditLog({ action: 'CASE_ACCESS_DENIED', actor: req.user, entityType: 'RiskAlert', entityId: alert?._id, caseRef: alert?.caseRef, metadata: { reason: alert ? 'not_assigned' : 'not_found' } });
        res.status(alert ? 403 : 404).json({ success: false, message: alert ? 'You are not assigned to this alert' : 'Alert not found' });
        return null;
    }
    return alert;
}

async function loadAssignedPlan(req, res) {
    if (!isObjectId(req.params.id)) { res.status(400).json({ success: false, message: 'Invalid plan id' }); return null; }
    const plan = await SupportPlan.findById(req.params.id);
    if (!plan) { res.status(404).json({ success: false, message: 'Support plan not found' }); return null; }
    const consent = await VictimSupportConsent.findOne({ caseRef: plan.caseRef }).select('assignedCounselor').lean();
    if (!consent || String(consent.assignedCounselor) !== String(req.user._id)) {
        await auditLog({ action: 'CASE_ACCESS_DENIED', actor: req.user, caseRef: plan.caseRef, entityType: 'SupportPlan', entityId: plan._id, metadata: { reason: 'not_assigned' } });
        res.status(403).json({ success: false, message: 'You are not assigned to this case' });
        return null;
    }
    return plan;
}

// GET /api/counselor/dashboard
const getDashboard = async (req, res) => {
    const me = req.user._id;
    const myCases = await VictimSupportConsent.find({ assignedCounselor: me }).select('caseRef status').lean();
    const caseRefs = myCases.map((c) => c.caseRef);
    const [newAlerts, highPriority, openAlerts, resolvedAlerts, pendingFollowUps, recentActivity, openReferrals, referralsDue] = await Promise.all([
        RiskAlert.countDocuments({ assignedCounselor: me, status: 'New' }),
        RiskAlert.countDocuments({ assignedCounselor: me, isOpen: true, priority: { $in: ['high', 'urgent'] } }),
        RiskAlert.countDocuments({ assignedCounselor: me, isOpen: true }),
        RiskAlert.countDocuments({ assignedCounselor: me, status: 'Resolved' }),
        CaseNote.countDocuments({ counselorId: me, type: 'follow_up', followUpStatus: 'pending' }),
        AuditEvent.find({ caseRef: { $in: caseRefs }, action: { $nin: ['CASE_ACCESSED', 'REMINDER_SENT'] } })
            .sort({ createdAt: -1 }).limit(12).select('action caseRef actorRole createdAt metadata.alertRef metadata.category metadata.to metadata.referralRef').lean(),
        Referral.countDocuments({ caseRef: { $in: caseRefs }, status: { $nin: Referral.CLOSED_STATUSES } }),
        Referral.countDocuments({ caseRef: { $in: caseRefs }, status: { $nin: Referral.CLOSED_STATUSES }, followUpDate: { $lte: new Date() } }),
    ]);
    res.json({
        success: true,
        data: {
            stats: {
                totalAssignedCases: myCases.length,
                activeCases: myCases.filter((c) => c.status === 'active').length,
                newAlerts,
                highPriorityAlerts: highPriority,
                openAlerts,
                pendingFollowUps,
                resolvedCases: resolvedAlerts,
                openReferrals,
                referralsDue,
            },
            recentActivity: recentActivity.map((e) => ({ action: e.action, caseRef: e.caseRef, actorRole: e.actorRole, createdAt: e.createdAt, alertRef: e.metadata?.alertRef || e.metadata?.referralRef, category: e.metadata?.category, to: e.metadata?.to })),
        },
    });
};

// GET /api/counselor/cases
const listCases = async (req, res) => {
    const me = req.user._id;
    const cases = await VictimSupportConsent.find({ assignedCounselor: me }).populate('userId', 'name username').sort({ lastCheckinAt: -1 }).lean();
    const userIds = cases.map((c) => c.userId?._id).filter(Boolean);
    const [openAlerts, followUps] = await Promise.all([
        RiskAlert.find({ userId: { $in: userIds }, isOpen: true }).lean(),
        CaseNote.aggregate([
            { $match: { counselorId: me, type: 'follow_up', followUpStatus: 'pending' } },
            { $group: { _id: '$caseRef', n: { $sum: 1 } } },
        ]),
    ]);
    const alertByUser = new Map(openAlerts.map((a) => [String(a.userId), a]));
    const followUpMap = new Map(followUps.map((f) => [f._id, f.n]));
    res.json({
        success: true,
        data: cases.map((c) => {
            const a = c.userId ? alertByUser.get(String(c.userId._id)) : null;
            return {
                caseRef: c.caseRef,
                userName: c.userId?.name || 'Deleted user',
                username: c.userId?.username || null,
                consentStatus: c.status,
                latestCategory: c.latestCategory || null,
                latestScore: c.latestScore ?? null,
                lastCheckinAt: c.lastCheckinAt,
                checkinCount: c.checkinCount || 0,
                assignedAt: c.assignedAt,
                pendingFollowUps: followUpMap.get(c.caseRef) || 0,
                openAlert: a ? { _id: String(a._id), alertRef: a.alertRef, status: a.status, category: a.category, priority: a.priority, hasNewActivity: a.hasNewActivity } : null,
                isSynthetic: !!c.isSynthetic,
            };
        }),
    });
};

// GET /api/counselor/cases/:caseRef
const getCaseDetails = async (req, res) => {
    const consent = await loadAssignedCase(req, res, req.params.caseRef);
    if (!consent) return;
    const userId = consent.userId?._id;
    const [checkins, assessments, alerts, notes, plans, referrals] = await Promise.all([
        WellbeingCheckin.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
        DistressAssessment.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
        RiskAlert.find({ userId }).sort({ createdAt: -1 }).populate('assignedCounselor', 'name').lean(),
        CaseNote.find({ caseRef: consent.caseRef }).sort({ createdAt: -1 }).populate('counselorId', 'name').lean(),
        SupportPlan.find({ caseRef: consent.caseRef }).sort({ updatedAt: -1 }).populate('counselorId', 'name').lean(),
        Referral.find({ caseRef: consent.caseRef }).sort({ createdAt: -1 }).populate('counselorId', 'name').lean(),
    ]);
    const byCheckin = new Map(assessments.map((a) => [String(a.checkinId), a]));

    // Viewing the case clears the "new activity" marker
    await RiskAlert.updateMany({ userId, assignedCounselor: req.user._id, hasNewActivity: true }, { $set: { hasNewActivity: false } });
    await auditLog({ action: 'CASE_ACCESSED', actor: req.user, targetUserId: userId, caseRef: consent.caseRef, entityType: 'VictimSupportConsent', entityId: consent._id });

    res.json({
        success: true,
        data: {
            case: {
                caseRef: consent.caseRef,
                consentStatus: consent.status,
                consentGrantedAt: consent.grantedAt,
                consentWithdrawnAt: consent.withdrawnAt,
                withdrawalDataChoice: consent.withdrawalDataChoice,
                allowAiAnalysis: consent.allowAiAnalysis,
                district: consent.district || null,
                latestCategory: consent.latestCategory,
                latestScore: consent.latestScore,
                lastCheckinAt: consent.lastCheckinAt,
                checkinCount: consent.checkinCount,
                isSynthetic: !!consent.isSynthetic,
                user: consent.userId ? { name: consent.userId.name, email: consent.userId.email, username: consent.userId.username } : null,
            },
            checkins: checkins.map((c) => ({ ...S.checkinForCounselor(c), assessment: S.assessmentForCounselor(byCheckin.get(String(c._id))) })),
            trends: [...checkins].reverse().map((c) => ({
                date: c.createdAt,
                emotionalState: c.emotionalState,
                stressLevel: c.stressLevel,
                anxietyLevel: c.anxietyLevel,
                sleepQuality: c.sleepQuality,
                score: byCheckin.get(String(c._id))?.score ?? null,
                category: byCheckin.get(String(c._id))?.category ?? null,
            })),
            alerts: alerts.map(S.alertForCounselor),
            notes: notes.map(S.noteForCounselor),
            supportPlans: plans.map(S.planForCounselor),
            referrals: referrals.map(require('./referralController').referralForCounselor),
            options: { alertStatuses: ALERT_STATUSES, supportCategories: SUPPORT_CATEGORIES, itemStatuses: ITEM_STATUSES, externalCategories: EXTERNAL_CATEGORIES, referralStatuses: Referral.STATUSES },
        },
    });
};

// GET /api/counselor/alerts?status=&priority=&category=
const listAlerts = async (req, res) => {
    const filter = { assignedCounselor: req.user._id };
    if (ALERT_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.status === 'open') filter.isOpen = true;
    if (['normal', 'high', 'urgent'].includes(req.query.priority)) filter.priority = req.query.priority;
    if (DistressAssessment.CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
    const alerts = await RiskAlert.find(filter).sort({ isOpen: -1, lastTriggeredAt: -1 }).limit(100).populate('assignedCounselor', 'name').lean();
    res.json({ success: true, data: alerts.map(S.alertForCounselor) });
};

// PATCH /api/counselor/alerts/:id/status   { status, note? }
const updateAlertStatus = async (req, res) => {
    const { status } = req.body;
    if (!ALERT_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: `Status must be one of: ${ALERT_STATUSES.join(', ')}` });
    }
    const alert = await loadAssignedAlert(req, res);
    if (!alert) return;
    if (alert.anonymized) return res.status(409).json({ success: false, message: 'This alert was anonymised and cannot be changed' });
    if (alert.status === status) return res.json({ success: true, message: 'Status unchanged', data: S.alertForCounselor(alert) });

    const from = alert.status;
    if (from === 'Resolved' && status !== 'Resolved') {
        const otherOpen = await RiskAlert.exists({ userId: alert.userId, isOpen: true, _id: { $ne: alert._id } });
        if (otherOpen) return res.status(409).json({ success: false, message: 'Another open alert already exists for this case. Update that alert instead.' });
        alert.isOpen = true;
        alert.resolvedAt = undefined;
    }
    if (status === 'Resolved') {
        alert.isOpen = false;
        alert.resolvedAt = new Date();
    }
    alert.status = status;
    alert.hasNewActivity = false;
    alert.statusHistory.push({ from, to: status, changedBy: req.user._id, changedAt: new Date() });
    const note = str(req.body.note, 2000);
    if (note) alert.reviewNotes.push({ authorId: req.user._id, authorName: req.user.name, note: encryptText(note) });
    await alert.save();

    await auditLog({ action: 'ALERT_STATUS_CHANGED', actor: req.user, targetUserId: alert.userId, caseRef: alert.caseRef, entityType: 'RiskAlert', entityId: alert._id, metadata: { alertRef: alert.alertRef, from, to: status, withNote: !!note } });

    const userMessages = {
        'Under Review': 'A counselor is reviewing your recent check-in.',
        'Contact Initiated': 'Your counselor is reaching out to you about your recent check-in.',
    };
    if (userMessages[status]) {
        await notify(alert.userId, { type: 'alert_updated', title: 'Update on your check-in', message: userMessages[status], link: '/victim-support/dashboard', email: status === 'Contact Initiated' });
    }

    const fresh = await RiskAlert.findById(alert._id).populate('assignedCounselor', 'name').lean();
    res.json({ success: true, message: `Alert marked as ${status}`, data: S.alertForCounselor(fresh) });
};

// POST /api/counselor/alerts/:id/notes   { note }
const addAlertNote = async (req, res) => {
    const note = str(req.body.note, 2000);
    if (!note) return res.status(400).json({ success: false, message: 'Note cannot be empty' });
    const alert = await loadAssignedAlert(req, res);
    if (!alert) return;
    alert.reviewNotes.push({ authorId: req.user._id, authorName: req.user.name, note: encryptText(note) });
    await alert.save();
    await auditLog({ action: 'ALERT_REVIEW_NOTE_ADDED', actor: req.user, targetUserId: alert.userId, caseRef: alert.caseRef, entityType: 'RiskAlert', entityId: alert._id, metadata: { alertRef: alert.alertRef } });
    const fresh = await RiskAlert.findById(alert._id).populate('assignedCounselor', 'name').lean();
    res.status(201).json({ success: true, message: 'Private note added', data: S.alertForCounselor(fresh) });
};

// POST /api/counselor/cases/:caseRef/notes   { type: 'note'|'follow_up', content, followUpDate?, alertId? }
const addCaseNote = async (req, res) => {
    const consent = await loadAssignedCase(req, res, req.params.caseRef);
    if (!consent) return;
    const type = req.body.type === 'follow_up' ? 'follow_up' : 'note';
    const content = str(req.body.content, 4000);
    if (!content) return res.status(400).json({ success: false, message: 'Please describe the note or follow-up action' });

    let followUpDate;
    if (type === 'follow_up' && req.body.followUpDate) {
        followUpDate = new Date(req.body.followUpDate);
        if (Number.isNaN(followUpDate.getTime())) return res.status(400).json({ success: false, message: 'Invalid follow-up date' });
    }
    let alertId;
    if (req.body.alertId && isObjectId(req.body.alertId)) {
        const a = await RiskAlert.findOne({ _id: req.body.alertId, caseRef: consent.caseRef }).select('_id').lean();
        alertId = a?._id;
    }

    const note = await CaseNote.create({
        userId: consent.userId._id,
        caseRef: consent.caseRef,
        counselorId: req.user._id,
        alertId,
        type,
        content: encryptText(content),
        followUpDate,
        followUpStatus: type === 'follow_up' ? 'pending' : null,
    });
    await auditLog({ action: type === 'follow_up' ? 'FOLLOW_UP_RECORDED' : 'CASE_NOTE_ADDED', actor: req.user, targetUserId: consent.userId._id, caseRef: consent.caseRef, entityType: 'CaseNote', entityId: note._id, metadata: { kind: type } });
    const populated = await CaseNote.findById(note._id).populate('counselorId', 'name').lean();
    res.status(201).json({ success: true, message: type === 'follow_up' ? 'Follow-up recorded' : 'Private note saved', data: S.noteForCounselor(populated) });
};

// PATCH /api/counselor/cases/:caseRef/notes/:noteId   { followUpStatus: 'pending'|'completed' }
const updateCaseNote = async (req, res) => {
    const consent = await loadAssignedCase(req, res, req.params.caseRef);
    if (!consent) return;
    if (!isObjectId(req.params.noteId)) return res.status(400).json({ success: false, message: 'Invalid note id' });
    const note = await CaseNote.findOne({ _id: req.params.noteId, caseRef: consent.caseRef, type: 'follow_up' });
    if (!note) return res.status(404).json({ success: false, message: 'Follow-up not found' });
    if (!['pending', 'completed'].includes(req.body.followUpStatus)) return res.status(400).json({ success: false, message: 'Invalid follow-up status' });
    note.followUpStatus = req.body.followUpStatus;
    note.completedAt = note.followUpStatus === 'completed' ? new Date() : undefined;
    await note.save();
    await auditLog({ action: 'FOLLOW_UP_UPDATED', actor: req.user, targetUserId: consent.userId._id, caseRef: consent.caseRef, entityType: 'CaseNote', entityId: note._id, metadata: { followUpStatus: note.followUpStatus } });
    const populated = await CaseNote.findById(note._id).populate('counselorId', 'name').lean();
    res.json({ success: true, message: 'Follow-up updated', data: S.noteForCounselor(populated) });
};

/** Validates one support-plan item. Returns { item, error }. */
function buildPlanItem(input = {}, actorId, existing) {
    const item = existing ? existing : {};
    if (input.category !== undefined) {
        if (!SUPPORT_CATEGORIES.includes(input.category)) return { error: 'Invalid support category' };
        item.category = input.category;
    }
    if (input.title !== undefined) item.title = str(input.title, 140);
    if (input.description !== undefined) item.description = str(input.description, 1000);
    if (input.status !== undefined) {
        if (!ITEM_STATUSES.includes(input.status)) return { error: `Status must be one of: ${ITEM_STATUSES.join(', ')}` };
        item.status = input.status;
    }
    if (input.referral !== undefined && input.referral) {
        item.referral = {
            organization: str(input.referral.organization, 140),
            contactInfo: str(input.referral.contactInfo, 200),
            referredAt: input.referral.organization ? (item.referral?.referredAt || new Date()) : undefined,
        };
    }
    if (input.externalConfirmation !== undefined && input.externalConfirmation) {
        const confirmed = input.externalConfirmation.confirmed === true;
        item.externalConfirmation = {
            confirmed,
            note: str(input.externalConfirmation.note, 500),
            confirmedAt: confirmed ? (item.externalConfirmation?.confirmedAt || new Date()) : undefined,
            confirmedBy: confirmed ? actorId : undefined,
        };
    }
    if (input.followUpDate !== undefined) {
        if (!input.followUpDate) item.followUpDate = undefined;
        else {
            const d = new Date(input.followUpDate);
            if (Number.isNaN(d.getTime())) return { error: 'Invalid follow-up date' };
            item.followUpDate = d;
        }
    }
    if (input.privateNote !== undefined) item.privateNote = str(input.privateNote, 2000) ? encryptText(str(input.privateNote, 2000)) : undefined;
    item.updatedBy = actorId;

    if (!item.category) return { error: 'Support category is required' };
    if (!item.title) return { error: 'Each support item needs a title' };
    if (!item.status) item.status = 'Suggested';
    // Never claim an external service was delivered without explicit confirmation
    if (item.status === 'Completed' && EXTERNAL_CATEGORIES.includes(item.category)
        && !(item.externalConfirmation?.confirmed && item.externalConfirmation?.note)) {
        return { error: `"${item.category}" depends on an external service. Record a confirmation note (who confirmed delivery and how) before marking it Completed.` };
    }
    return { item };
}

// GET /api/counselor/support-plans
const listSupportPlans = async (req, res) => {
    const myCaseRefs = (await VictimSupportConsent.find({ assignedCounselor: req.user._id }).select('caseRef').lean()).map((c) => c.caseRef);
    const plans = await SupportPlan.find({ caseRef: { $in: myCaseRefs } }).sort({ updatedAt: -1 }).populate('counselorId', 'name').lean();
    res.json({ success: true, data: plans.map(S.planForCounselor) });
};

// POST /api/counselor/cases/:caseRef/support-plans   { title, summary, items: [] }
const createSupportPlan = async (req, res) => {
    const consent = await loadAssignedCase(req, res, req.params.caseRef);
    if (!consent) return;
    if (!consent.userId) return res.status(409).json({ success: false, message: 'This case no longer has an active user' });
    const title = str(req.body.title, 140);
    if (!title) return res.status(400).json({ success: false, message: 'Plan title is required' });

    const items = [];
    for (const input of Array.isArray(req.body.items) ? req.body.items.slice(0, 30) : []) {
        const { item, error } = buildPlanItem(input, req.user._id);
        if (error) return res.status(400).json({ success: false, message: error });
        items.push(item);
    }

    const plan = await SupportPlan.create({
        userId: consent.userId._id,
        caseRef: consent.caseRef,
        counselorId: req.user._id,
        title,
        summary: str(req.body.summary, 2000),
        items,
    });
    await auditLog({ action: 'SUPPORT_PLAN_CREATED', actor: req.user, targetUserId: consent.userId._id, caseRef: consent.caseRef, entityType: 'SupportPlan', entityId: plan._id, metadata: { itemCount: items.length, categories: items.map((i) => i.category) } });
    await notify(consent.userId._id, { type: 'support_plan_updated', title: 'A support plan was created for you', message: 'Your counselor has shared a support plan. You can view it on your Victim Support dashboard.', link: '/victim-support/dashboard', email: true });

    const populated = await SupportPlan.findById(plan._id).populate('counselorId', 'name').lean();
    res.status(201).json({ success: true, message: 'Support plan created', data: S.planForCounselor(populated) });
};

// PATCH /api/counselor/support-plans/:id   { title?, summary?, status? }
const updateSupportPlan = async (req, res) => {
    const plan = await loadAssignedPlan(req, res);
    if (!plan) return;
    const changed = [];
    if (req.body.title !== undefined) {
        const title = str(req.body.title, 140);
        if (!title) return res.status(400).json({ success: false, message: 'Plan title cannot be empty' });
        plan.title = title; changed.push('title');
    }
    if (req.body.summary !== undefined) { plan.summary = str(req.body.summary, 2000); changed.push('summary'); }
    if (req.body.status !== undefined) {
        if (!['active', 'completed', 'archived'].includes(req.body.status)) return res.status(400).json({ success: false, message: 'Invalid plan status' });
        plan.status = req.body.status; changed.push('status');
    }
    await plan.save();
    await auditLog({ action: 'SUPPORT_PLAN_UPDATED', actor: req.user, targetUserId: plan.userId, caseRef: plan.caseRef, entityType: 'SupportPlan', entityId: plan._id, metadata: { changed, status: plan.status } });
    const populated = await SupportPlan.findById(plan._id).populate('counselorId', 'name').lean();
    res.json({ success: true, message: 'Support plan updated', data: S.planForCounselor(populated) });
};

// POST /api/counselor/support-plans/:id/items
const addPlanItem = async (req, res) => {
    const plan = await loadAssignedPlan(req, res);
    if (!plan) return;
    if (plan.items.length >= 30) return res.status(400).json({ success: false, message: 'A plan can contain at most 30 items' });
    const { item, error } = buildPlanItem(req.body, req.user._id);
    if (error) return res.status(400).json({ success: false, message: error });
    plan.items.push(item);
    await plan.save();
    await auditLog({ action: 'SUPPORT_PLAN_ITEM_ADDED', actor: req.user, targetUserId: plan.userId, caseRef: plan.caseRef, entityType: 'SupportPlan', entityId: plan._id, metadata: { category: item.category, status: item.status } });
    await notify(plan.userId, { type: 'support_plan_updated', title: 'Your support plan was updated', message: 'A new item was added to your support plan.', link: '/victim-support/dashboard' });
    const populated = await SupportPlan.findById(plan._id).populate('counselorId', 'name').lean();
    res.status(201).json({ success: true, message: 'Support item added', data: S.planForCounselor(populated) });
};

// PATCH /api/counselor/support-plans/:id/items/:itemId
const updatePlanItem = async (req, res) => {
    const plan = await loadAssignedPlan(req, res);
    if (!plan) return;
    const existing = plan.items.id(req.params.itemId);
    if (!existing) return res.status(404).json({ success: false, message: 'Support item not found' });
    const fromStatus = existing.status;
    const snapshot = existing.toObject();
    const { error } = buildPlanItem(req.body, req.user._id, existing);
    if (error) {
        existing.set(snapshot); // roll back partial changes
        return res.status(400).json({ success: false, message: error });
    }
    await plan.save();
    await auditLog({ action: 'SUPPORT_PLAN_ITEM_UPDATED', actor: req.user, targetUserId: plan.userId, caseRef: plan.caseRef, entityType: 'SupportPlan', entityId: plan._id, metadata: { category: existing.category, from: fromStatus, to: existing.status, externallyConfirmed: !!existing.externalConfirmation?.confirmed } });
    if (fromStatus !== existing.status) {
        await notify(plan.userId, { type: 'support_plan_updated', title: 'Your support plan was updated', message: `"${existing.title}" is now ${existing.status}.`, link: '/victim-support/dashboard' });
    }
    const populated = await SupportPlan.findById(plan._id).populate('counselorId', 'name').lean();
    res.json({ success: true, message: 'Support item updated', data: S.planForCounselor(populated) });
};

module.exports = {
    getDashboard,
    listCases,
    getCaseDetails,
    listAlerts,
    updateAlertStatus,
    addAlertNote,
    addCaseNote,
    updateCaseNote,
    listSupportPlans,
    createSupportPlan,
    updateSupportPlan,
    addPlanItem,
    updatePlanItem,
};
