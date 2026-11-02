// Referral management. Counselors manage referrals on their ASSIGNED cases only; users see
// non-sensitive status information for their own referrals. Nothing is transmitted externally
// unless an authorised integration exists AND the user consented (none exist today).
const mongoose = require('mongoose');
const Referral = require('../models/Referral');
const SupportPlan = require('../models/SupportPlan');
const VictimSupportConsent = require('../models/VictimSupportConsent');
const { SUPPORT_DIRECTORY, findDirectoryEntry } = require('../config/supportDirectory');
const { generateReferralRef } = require('../services/caseService');
const { listDirectory, integrationStatus, submitReferral } = require('../services/integrations/externalReferralService');
const { auditLog } = require('../services/auditService');
const { notify } = require('../services/notificationService');
const { encryptText, decryptText } = require('../utils/fieldCrypto');

const { STATUSES, CLOSED_STATUSES } = Referral;
const { SUPPORT_CATEGORIES } = SupportPlan;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isObjectId = (v) => mongoose.isValidObjectId(v);

const USER_STATUS_TEXT = {
    Suggested: 'Your counselor has suggested this service.',
    Accepted: 'You agreed to this referral. Your counselor will arrange the next step.',
    Referred: 'Your counselor has referred you to this service.',
    'Follow-up Pending': 'Your counselor will follow up on this referral.',
    Completed: 'This referral is complete.',
    'Unable to Connect': 'Your counselor could not connect with this service yet and will discuss alternatives with you.',
};

// ---------------- serializers ----------------
function referralForCounselor(r) {
    return {
        _id: String(r._id),
        referralRef: r.referralRef,
        caseRef: r.caseRef,
        category: r.category,
        title: r.title,
        description: r.description || '',
        organization: r.organization || {},
        integration: { ...(r.integration || {}), ...integrationStatus(r.organization?.directoryId) },
        status: r.status,
        statusHistory: r.statusHistory || [],
        followUpDate: r.followUpDate,
        followUpDue: !!(r.followUpDate && !CLOSED_STATUSES.includes(r.status) && new Date(r.followUpDate) <= new Date()),
        userVisibleUpdate: r.userVisibleUpdate || '',
        counselorNotes: (r.counselorNotes || []).map((n) => ({ _id: String(n._id), authorName: n.authorName, note: decryptText(n.note), createdAt: n.createdAt })),
        outcome: { confirmed: !!r.outcome?.confirmed, note: r.outcome?.note ? decryptText(r.outcome.note) : '', confirmedAt: r.outcome?.confirmedAt },
        unableReason: r.unableReason ? decryptText(r.unableReason) : '',
        userConsentToShare: !!r.userConsentToShare,
        supportPlanId: r.supportPlanId ? String(r.supportPlanId) : null,
        counselorName: r.counselorId?.name || null,
        isSynthetic: !!r.isSynthetic,
        closedAt: r.closedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
    };
}

/** Non-sensitive view for the user: no private notes, outcome notes or internal reasons. */
function referralForUser(r) {
    return {
        referralRef: r.referralRef,
        category: r.category,
        title: r.title,
        description: r.description || '',
        organization: { name: r.organization?.name || '', contact: r.organization?.contact || '', website: r.organization?.website || '' },
        status: r.status,
        statusMessage: USER_STATUS_TEXT[r.status],
        update: r.userVisibleUpdate || '',
        followUpDate: CLOSED_STATUSES.includes(r.status) ? null : r.followUpDate,
        externalIntegration: 'not_connected',
        userConsentToShare: !!r.userConsentToShare,
        isSynthetic: !!r.isSynthetic,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
    };
}

// ---------------- helpers ----------------
async function loadAssignedConsent(req, res, caseRef) {
    const consent = await VictimSupportConsent.findOne({ caseRef: String(caseRef || '').toUpperCase() });
    if (!consent || String(consent.assignedCounselor) !== String(req.user._id)) {
        await auditLog({ action: 'CASE_ACCESS_DENIED', actor: req.user, caseRef: String(caseRef).slice(0, 20), metadata: { reason: consent ? 'not_assigned' : 'not_found', area: 'referrals' } });
        res.status(consent ? 403 : 404).json({ success: false, message: consent ? 'You are not assigned to this case' : 'Case not found' });
        return null;
    }
    return consent;
}

async function loadAssignedReferral(req, res) {
    if (!isObjectId(req.params.id)) { res.status(400).json({ success: false, message: 'Invalid referral id' }); return null; }
    const referral = await Referral.findById(req.params.id);
    if (!referral) { res.status(404).json({ success: false, message: 'Referral not found' }); return null; }
    const consent = await VictimSupportConsent.findOne({ caseRef: referral.caseRef }).select('assignedCounselor').lean();
    if (!consent || String(consent.assignedCounselor) !== String(req.user._id)) {
        await auditLog({ action: 'CASE_ACCESS_DENIED', actor: req.user, caseRef: referral.caseRef, entityType: 'Referral', entityId: referral._id, metadata: { reason: 'not_assigned', area: 'referrals' } });
        res.status(403).json({ success: false, message: 'You are not assigned to this case' });
        return null;
    }
    return referral;
}

function applyOrganization(referral, input) {
    if (!input || typeof input !== 'object') return null;
    if (input.directoryId) {
        const entry = findDirectoryEntry(String(input.directoryId));
        if (!entry) return 'Unknown support directory entry';
        referral.organization = { directoryId: entry.id, name: entry.name, contact: entry.phone, website: entry.website };
        return null;
    }
    const name = str(input.name, 140);
    if (!name && (input.contact || input.website)) return 'Organisation name is required';
    const website = str(input.website, 300);
    if (website && !/^https?:\/\//i.test(website)) return 'Website must start with http:// or https://';
    referral.organization = { directoryId: undefined, name, contact: str(input.contact, 200), website };
    return null;
}

function parseDate(value) {
    if (value === null || value === '') return { value: null };
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? { error: 'Invalid follow-up date' } : { value: d };
}

/** Status transition rules: completion needs confirmation; "Unable to Connect" needs a reason. */
function applyStatus(referral, status, body, actorId) {
    if (!STATUSES.includes(status)) return `Status must be one of: ${STATUSES.join(', ')}`;
    if (status === referral.status) return null;
    if (status === 'Completed') {
        const note = str(body.outcomeNote, 1000);
        if (!note) return 'Record how completion was confirmed (who confirmed the service was received, and how) before marking it Completed.';
        referral.outcome = { confirmed: true, note: encryptText(note), confirmedAt: new Date() };
    }
    if (status === 'Unable to Connect') {
        const reason = str(body.unableReason, 1000);
        if (!reason) return 'Please record why the connection could not be made (kept private).';
        referral.unableReason = encryptText(reason);
    }
    referral.statusHistory.push({ from: referral.status, to: status, changedBy: actorId, changedAt: new Date() });
    referral.status = status;
    referral.closedAt = CLOSED_STATUSES.includes(status) ? new Date() : undefined;
    return null;
}

// ---------------- counselor endpoints ----------------

// GET /api/counselor/referral-directory
const getDirectory = async (req, res) => {
    res.json({ success: true, data: { directory: listDirectory(), categories: SUPPORT_CATEGORIES, statuses: STATUSES } });
};

// GET /api/counselor/referrals?status=&due=1
const listCounselorReferrals = async (req, res) => {
    const myCaseRefs = (await VictimSupportConsent.find({ assignedCounselor: req.user._id }).select('caseRef').lean()).map((c) => c.caseRef);
    const filter = { caseRef: { $in: myCaseRefs } };
    if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.status === 'open') filter.status = { $nin: CLOSED_STATUSES };
    if (req.query.due === '1') { filter.followUpDate = { $lte: new Date() }; filter.status = { $nin: CLOSED_STATUSES }; }
    const rows = await Referral.find(filter).sort({ followUpDate: 1, updatedAt: -1 }).limit(200).populate('counselorId', 'name').lean();
    res.json({ success: true, data: rows.map(referralForCounselor) });
};

// POST /api/counselor/cases/:caseRef/referrals
const createReferral = async (req, res) => {
    const consent = await loadAssignedConsent(req, res, req.params.caseRef);
    if (!consent) return;
    if (consent.status !== 'active') return res.status(409).json({ success: false, message: 'Consent for this case was withdrawn; new referrals cannot be created.' });

    const category = req.body.category;
    if (!SUPPORT_CATEGORIES.includes(category)) return res.status(400).json({ success: false, message: 'Please choose a valid support category' });
    const title = str(req.body.title, 140);
    if (!title) return res.status(400).json({ success: false, message: 'Referral title is required' });

    const referral = new Referral({
        referralRef: await generateReferralRef(),
        userId: consent.userId,
        caseRef: consent.caseRef,
        counselorId: req.user._id,
        category,
        title,
        description: str(req.body.description, 1000),
        userVisibleUpdate: str(req.body.userVisibleUpdate, 300),
        status: 'Suggested',
        statusHistory: [{ from: null, to: 'Suggested', changedBy: req.user._id, changedAt: new Date() }],
    });
    const orgError = applyOrganization(referral, req.body.organization);
    if (orgError) return res.status(400).json({ success: false, message: orgError });
    if (req.body.followUpDate) {
        const d = parseDate(req.body.followUpDate);
        if (d.error) return res.status(400).json({ success: false, message: d.error });
        referral.followUpDate = d.value;
    }
    if (req.body.status && req.body.status !== 'Suggested') {
        const err = applyStatus(referral, req.body.status, req.body, req.user._id);
        if (err) return res.status(400).json({ success: false, message: err });
    }
    if (req.body.supportPlanId && isObjectId(req.body.supportPlanId)) {
        const plan = await SupportPlan.findOne({ _id: req.body.supportPlanId, caseRef: consent.caseRef }).select('_id items._id').lean();
        if (!plan) return res.status(400).json({ success: false, message: 'Support plan not found for this case' });
        referral.supportPlanId = plan._id;
        if (req.body.supportPlanItemId && plan.items.some((i) => String(i._id) === String(req.body.supportPlanItemId))) referral.supportPlanItemId = req.body.supportPlanItemId;
    }
    const note = str(req.body.counselorNote, 2000);
    if (note) referral.counselorNotes.push({ authorId: req.user._id, authorName: req.user.name, note: encryptText(note) });

    await referral.save();
    await auditLog({ action: 'REFERRAL_CREATED', actor: req.user, targetUserId: referral.userId, caseRef: referral.caseRef, entityType: 'Referral', entityId: referral._id, metadata: { referralRef: referral.referralRef, category, status: referral.status, directoryId: referral.organization?.directoryId || null } });
    await notify(referral.userId, { type: 'support_plan_updated', title: 'New support referral', message: `Your counselor suggested a support service (${referral.referralRef}).`, link: '/victim-support/dashboard?tab=plan', email: true });

    const populated = await Referral.findById(referral._id).populate('counselorId', 'name').lean();
    res.status(201).json({ success: true, message: 'Referral created', data: referralForCounselor(populated) });
};

// PATCH /api/counselor/referrals/:id
const updateReferral = async (req, res) => {
    const referral = await loadAssignedReferral(req, res);
    if (!referral) return;
    const changed = [];
    const fromStatus = referral.status;

    if (req.body.title !== undefined) {
        const title = str(req.body.title, 140);
        if (!title) return res.status(400).json({ success: false, message: 'Referral title cannot be empty' });
        referral.title = title; changed.push('title');
    }
    if (req.body.description !== undefined) { referral.description = str(req.body.description, 1000); changed.push('description'); }
    if (req.body.userVisibleUpdate !== undefined) { referral.userVisibleUpdate = str(req.body.userVisibleUpdate, 300); changed.push('userVisibleUpdate'); }
    if (req.body.category !== undefined) {
        if (!SUPPORT_CATEGORIES.includes(req.body.category)) return res.status(400).json({ success: false, message: 'Invalid support category' });
        referral.category = req.body.category; changed.push('category');
    }
    if (req.body.organization !== undefined) {
        const orgError = applyOrganization(referral, req.body.organization);
        if (orgError) return res.status(400).json({ success: false, message: orgError });
        changed.push('organization');
    }
    if (req.body.followUpDate !== undefined) {
        const d = parseDate(req.body.followUpDate);
        if (d.error) return res.status(400).json({ success: false, message: d.error });
        referral.followUpDate = d.value || undefined; changed.push('followUpDate');
    }
    if (req.body.status !== undefined) {
        const err = applyStatus(referral, req.body.status, req.body, req.user._id);
        if (err) return res.status(400).json({ success: false, message: err });
        if (fromStatus !== referral.status) changed.push('status');
    }
    if (!changed.length) return res.status(400).json({ success: false, message: 'No changes supplied' });

    await referral.save();
    await auditLog({
        action: changed.includes('status') ? 'REFERRAL_STATUS_CHANGED' : 'REFERRAL_UPDATED',
        actor: req.user, targetUserId: referral.userId, caseRef: referral.caseRef, entityType: 'Referral', entityId: referral._id,
        metadata: { referralRef: referral.referralRef, changed, from: fromStatus, to: referral.status },
    });
    if (changed.includes('status') || changed.includes('userVisibleUpdate')) {
        await notify(referral.userId, { type: 'support_plan_updated', title: 'Referral update', message: `${referral.referralRef} is now "${referral.status}".`, link: '/victim-support/dashboard?tab=plan', email: changed.includes('status') });
    }
    const populated = await Referral.findById(referral._id).populate('counselorId', 'name').lean();
    res.json({ success: true, message: changed.includes('status') ? `Referral marked as ${referral.status}` : 'Referral updated', data: referralForCounselor(populated) });
};

// POST /api/counselor/referrals/:id/notes   { note }
const addReferralNote = async (req, res) => {
    const note = str(req.body.note, 2000);
    if (!note) return res.status(400).json({ success: false, message: 'Note cannot be empty' });
    const referral = await loadAssignedReferral(req, res);
    if (!referral) return;
    referral.counselorNotes.push({ authorId: req.user._id, authorName: req.user.name, note: encryptText(note) });
    await referral.save();
    await auditLog({ action: 'REFERRAL_NOTE_ADDED', actor: req.user, targetUserId: referral.userId, caseRef: referral.caseRef, entityType: 'Referral', entityId: referral._id, metadata: { referralRef: referral.referralRef } });
    const populated = await Referral.findById(referral._id).populate('counselorId', 'name').lean();
    res.status(201).json({ success: true, message: 'Private note added', data: referralForCounselor(populated) });
};

// POST /api/counselor/referrals/:id/external-submit
const externalSubmit = async (req, res) => {
    const referral = await loadAssignedReferral(req, res);
    if (!referral) return;
    const result = await submitReferral(referral, { actor: req.user });
    referral.integration = {
        ...(referral.integration?.toObject?.() || {}),
        status: result.status === 'submitted' ? 'submitted' : result.status === 'failed' ? 'failed' : 'not_connected',
        externalReference: result.externalReference,
        lastAttemptAt: new Date(),
        lastResult: result.status,
    };
    await referral.save();
    const code = result.status === 'submitted' ? 200 : result.status === 'failed' ? 502 : 409;
    res.status(code).json({ success: result.status === 'submitted', status: result.status, message: result.message, externalReference: result.externalReference });
};

// ---------------- user endpoints ----------------

// GET /api/victim-support/referrals
const listMyReferrals = async (req, res) => {
    const rows = await Referral.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: rows.map(referralForUser) });
};

// PATCH /api/victim-support/referrals/:ref/consent   { share: boolean }
const setShareConsent = async (req, res) => {
    if (typeof req.body.share !== 'boolean') return res.status(400).json({ success: false, message: 'share must be true or false' });
    const referral = await Referral.findOne({ referralRef: String(req.params.ref || '').toUpperCase(), userId: req.user._id });
    if (!referral) return res.status(404).json({ success: false, message: 'Referral not found' });
    referral.userConsentToShare = req.body.share;
    referral.userConsentChangedAt = new Date();
    await referral.save();
    await auditLog({ action: 'REFERRAL_SHARE_CONSENT_CHANGED', actor: req.user, targetUserId: req.user._id, caseRef: referral.caseRef, entityType: 'Referral', entityId: referral._id, metadata: { referralRef: referral.referralRef, share: req.body.share } });
    res.json({ success: true, message: req.body.share ? 'You allowed your details to be shared for this referral.' : 'Sharing permission withdrawn.', data: referralForUser(referral) });
};

module.exports = {
    getDirectory,
    listCounselorReferrals,
    createReferral,
    updateReferral,
    addReferralNote,
    externalSubmit,
    listMyReferrals,
    setShareConsent,
    referralForCounselor,
    referralForUser,
    SUPPORT_DIRECTORY,
};
