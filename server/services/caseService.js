// caseService – pseudonymous case references and counselor assignment.
const crypto = require('crypto');
const User = require('../models/User');
const VictimSupportConsent = require('../models/VictimSupportConsent');
const RiskAlert = require('../models/RiskAlert');
const { auditLog } = require('./auditService');
const { notify } = require('./notificationService');

// Crockford base32 (no I, L, O, U) – easy to read aloud, hard to confuse
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomRef(prefix, length = 6) {
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return `${prefix}-${out}`;
}

async function generateUniqueRef(Model, field, prefix) {
    for (let i = 0; i < 10; i++) {
        const ref = randomRef(prefix);
        if (!(await Model.exists({ [field]: ref }))) return ref;
    }
    throw new Error(`Could not generate a unique ${prefix} reference`);
}

const generateCaseRef = () => generateUniqueRef(VictimSupportConsent, 'caseRef', 'VS');
const generateAlertRef = () => generateUniqueRef(RiskAlert, 'alertRef', 'AL');
const generateReferralRef = () => generateUniqueRef(require('../models/Referral'), 'referralRef', 'RF');

/** Picks the approved counselor with the fewest active assigned cases (simple load balancing). */
async function pickLeastLoadedCounselor() {
    const counselors = await User.find({ role: 'counselor', isApproved: true }).select('_id name').lean();
    if (!counselors.length) return null;
    const loads = await VictimSupportConsent.aggregate([
        { $match: { status: 'active', assignedCounselor: { $in: counselors.map((c) => c._id) } } },
        { $group: { _id: '$assignedCounselor', n: { $sum: 1 } } },
    ]);
    const loadMap = new Map(loads.map((l) => [String(l._id), l.n]));
    counselors.sort((a, b) => (loadMap.get(String(a._id)) || 0) - (loadMap.get(String(b._id)) || 0));
    return counselors[0];
}

/**
 * Assigns a counselor to the case (consent document) and to its open alert.
 * @param {object} consent  VictimSupportConsent document
 * @param {object} [options] { counselorId, actor } – explicit assignment by an admin; otherwise automatic
 */
async function assignCounselor(consent, { counselorId, actor } = {}) {
    let counselor;
    if (counselorId) {
        counselor = await User.findOne({ _id: counselorId, role: 'counselor', isApproved: true }).select('_id name').lean();
        if (!counselor) {
            const err = new Error('Selected counselor was not found or is not approved');
            err.statusCode = 400;
            throw err;
        }
    } else {
        counselor = await pickLeastLoadedCounselor();
    }
    if (!counselor) return null;
    if (consent.assignedCounselor && String(consent.assignedCounselor) === String(counselor._id)) return counselor;

    const previous = consent.assignedCounselor;
    consent.assignedCounselor = counselor._id;
    consent.assignedAt = new Date();
    consent.history.push({ action: 'counselor_assigned', at: new Date() });
    await consent.save();
    await RiskAlert.updateMany({ userId: consent.userId, isOpen: true }, { $set: { assignedCounselor: counselor._id } });

    await auditLog({
        action: 'COUNSELOR_ASSIGNED',
        actor,
        targetUserId: consent.userId,
        caseRef: consent.caseRef,
        entityType: 'VictimSupportConsent',
        entityId: consent._id,
        metadata: { counselorId: String(counselor._id), reassigned: !!previous, mode: counselorId ? 'manual' : 'automatic' },
    });
    await notify(counselor._id, {
        type: 'case_assigned',
        title: `Case ${consent.caseRef} assigned to you`,
        message: 'A confidential victim-support case has been assigned to you for monitoring.',
        link: `/counselor/cases/${consent.caseRef}`,
        email: true,
        reference: consent.caseRef,
    });
    return counselor;
}

/** Ensures the case has a valid (existing, approved) counselor; auto-assigns when possible. */
async function ensureAssignment(consent) {
    if (consent.assignedCounselor) {
        const ok = await User.exists({ _id: consent.assignedCounselor, role: 'counselor', isApproved: true });
        if (ok) return consent.assignedCounselor;
    }
    const counselor = await assignCounselor(consent);
    return counselor ? counselor._id : null;
}

module.exports = { generateCaseRef, generateAlertRef, generateReferralRef, assignCounselor, ensureAssignment, pickLeastLoadedCounselor };
