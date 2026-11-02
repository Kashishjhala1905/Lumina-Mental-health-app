// victimDataService – deletion and retention handling for Victim Support data.
const WellbeingCheckin = require('../models/WellbeingCheckin');
const DistressAssessment = require('../models/DistressAssessment');
const RiskAlert = require('../models/RiskAlert');
const SupportPlan = require('../models/SupportPlan');
const CaseNote = require('../models/CaseNote');
const Referral = require('../models/Referral');
const ReminderEvent = require('../models/ReminderEvent');
const VictimSupportConsent = require('../models/VictimSupportConsent');
const { pauseForUser } = require('./reminderService');
const { auditLog } = require('./auditService');

/**
 * Permanently deletes a user's victim-support records (check-ins, assessments, alerts, plans, notes).
 * The consent record is kept (status + timestamps only) as proof of consent/withdrawal,
 * and audit events are kept because they contain no check-in content.
 */
async function deleteVictimSupportData(userId, { actor, reason = 'user_request' } = {}) {
    await pauseForUser(userId, 'data_deleted');
    const [checkins, assessments, alerts, plans, notes, referrals] = await Promise.all([
        WellbeingCheckin.deleteMany({ userId }),
        DistressAssessment.deleteMany({ userId }),
        RiskAlert.deleteMany({ userId }),
        SupportPlan.deleteMany({ userId }),
        CaseNote.deleteMany({ userId }),
        Referral.deleteMany({ userId }),
        ReminderEvent.deleteMany({ userId }),
    ]);

    const consent = await VictimSupportConsent.findOne({ userId });
    if (consent) {
        consent.dataDeletedAt = new Date();
        consent.latestCategory = undefined;
        consent.latestScore = undefined;
        consent.lastCheckinAt = undefined;
        consent.checkinCount = 0;
        consent.district = undefined;
        consent.history.push({ action: 'data_deleted', at: new Date() });
        await consent.save();
    }

    const counts = {
        checkins: checkins.deletedCount,
        assessments: assessments.deletedCount,
        alerts: alerts.deletedCount,
        supportPlans: plans.deletedCount,
        caseNotes: notes.deletedCount,
        referrals: referrals.deletedCount,
    };
    await auditLog({
        action: 'VS_DATA_DELETED',
        actor,
        targetUserId: userId,
        caseRef: consent?.caseRef,
        entityType: 'VictimSupportConsent',
        entityId: consent?._id,
        metadata: { reason, ...counts },
    });
    return counts;
}

/** Retention policy: purge data retained after withdrawal once VS_RETENTION_DAYS have passed. */
async function purgeExpiredRetainedData(now = new Date()) {
    const days = parseInt(process.env.VS_RETENTION_DAYS, 10) || 365;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const expired = await VictimSupportConsent.find({
        status: 'withdrawn',
        withdrawnAt: { $lte: cutoff },
        dataDeletedAt: null,
    }).select('userId').lean();
    for (const c of expired) {
        await deleteVictimSupportData(c.userId, { reason: 'retention_period_expired' });
    }
    return expired.length;
}

module.exports = { deleteVictimSupportData, purgeExpiredRetainedData };
