// checkinService – validation and the full check-in pipeline:
// save → rule-based score → optional AI analysis → alert rules → case snapshot → reminders → audit.
const WellbeingCheckin = require('../models/WellbeingCheckin');
const DistressAssessment = require('../models/DistressAssessment');
const { calculateAssessment } = require('./distressScoreService');
const { analyzeComment } = require('./aiAnalysisService');
const { processCheckin } = require('./alertEngineService');
const { rescheduleForUser } = require('./reminderService');
const { auditLog } = require('./auditService');
const { encryptText } = require('../utils/fieldCrypto');

const MAX_COMMENT = 2000;
const ENUMS = {
    safetyConcern: ['safe', 'somewhat_unsafe', 'unsafe', 'prefer_not_to_say'],
    socialSupport: ['strong', 'some', 'none', 'prefer_not_to_say'],
    needsProfessionalHelp: ['yes', 'no', 'unsure'],
};
const REQUIRED_SCALES = ['emotionalState', 'stressLevel', 'anxietyLevel'];
const OPTIONAL_SCALES = ['sleepQuality', 'dailyFunctioning'];

const isEmpty = (v) => v === undefined || v === null || v === '';

/** Validates a check-in payload. Optional questions may be omitted / null. */
function parseCheckinInput(body = {}) {
    const values = {};
    const errors = {};

    for (const key of [...REQUIRED_SCALES, ...OPTIONAL_SCALES]) {
        const raw = body[key];
        if (isEmpty(raw)) {
            if (REQUIRED_SCALES.includes(key)) errors[key] = 'Please choose a value from 1 to 5';
            else values[key] = null;
            continue;
        }
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 5) errors[key] = 'Value must be a whole number from 1 to 5';
        else values[key] = n;
    }

    for (const [key, allowed] of Object.entries(ENUMS)) {
        const raw = body[key];
        if (isEmpty(raw)) { values[key] = null; continue; }
        if (!allowed.includes(raw)) errors[key] = `Must be one of: ${allowed.join(', ')}`;
        else values[key] = raw;
    }

    values.requestCounselorContact = body.requestCounselorContact === true || body.requestCounselorContact === 'true';

    if (!isEmpty(body.comments)) {
        if (typeof body.comments !== 'string') errors.comments = 'Comments must be text';
        else if (body.comments.length > MAX_COMMENT) errors.comments = `Comments must be ${MAX_COMMENT} characters or fewer`;
        else values.comments = body.comments.trim();
    } else {
        values.comments = '';
    }

    return { values, errors };
}

/**
 * Runs the full pipeline for a validated check-in.
 * @param {object} p
 * @param {object} p.user      authenticated user document
 * @param {object} p.consent   active VictimSupportConsent document
 * @param {object} p.values    output of parseCheckinInput
 * @param {boolean} [p.isSynthetic]  demo/seed data
 * @param {boolean} [p.skipAi]       skip AI analysis (seed data)
 * @param {Date}    [p.createdAt]    backdated timestamp (seed data only)
 */
async function submitCheckin({ user, consent, values, isSynthetic = false, skipAi = false, createdAt }) {
    const plainComment = values.comments || '';
    const doc = {
        ...values,
        userId: user._id,
        caseRef: consent.caseRef,
        comments: plainComment ? encryptText(plainComment) : undefined,
        hasComment: !!plainComment,
        isSynthetic,
    };
    if (createdAt) { doc.createdAt = createdAt; doc.updatedAt = createdAt; }
    const checkin = await WellbeingCheckin.create([doc], { timestamps: !createdAt }).then((r) => r[0]);

    // Rule-based score (AI is never an input)
    const previous = await DistressAssessment.find({ userId: user._id, checkinId: { $ne: checkin._id }, createdAt: { $lt: checkin.createdAt } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('score baseScore category createdAt')
        .lean();
    const result = calculateAssessment({ ...values, comments: plainComment }, previous);

    // Optional AI analysis – only with consent for AI processing, and never blocking the check-in
    let ai;
    if (!plainComment) ai = { status: 'skipped', reason: 'no_comment' };
    else if (!consent.allowAiAnalysis) ai = { status: 'disabled', reason: 'user_opted_out' };
    else if (skipAi) ai = { status: 'skipped', reason: 'synthetic_seed' };
    else ai = await analyzeComment(plainComment);

    const aiStored = {
        ...ai,
        evidence: (ai.evidence || []).map(encryptText),
        summary: ai.summary ? encryptText(ai.summary) : undefined,
    };

    const assessmentDoc = {
        checkinId: checkin._id,
        userId: user._id,
        caseRef: consent.caseRef,
        ...result,
        ai: aiStored,
        isSynthetic,
    };
    if (createdAt) { assessmentDoc.createdAt = createdAt; assessmentDoc.updatedAt = createdAt; }
    const assessment = await DistressAssessment.create([assessmentDoc], { timestamps: !createdAt }).then((r) => r[0]);

    await auditLog({
        action: 'CHECKIN_SUBMITTED',
        actor: isSynthetic ? undefined : user,
        targetUserId: user._id,
        caseRef: consent.caseRef,
        entityType: 'WellbeingCheckin',
        entityId: checkin._id,
        metadata: { hasComment: !!plainComment, requestCounselorContact: values.requestCounselorContact, synthetic: isSynthetic },
    });
    await auditLog({
        action: 'MONITORING_SCORE_GENERATED',
        targetUserId: user._id,
        caseRef: consent.caseRef,
        entityType: 'DistressAssessment',
        entityId: assessment._id,
        metadata: { score: result.score, category: result.category, ruleVersion: result.ruleVersion, aiStatus: ai.status, synthetic: isSynthetic },
    });

    // Alert rules, with plain values (assessment.ai keeps confidence/humanReview flags)
    const alertResult = await processCheckin({
        checkin: { ...values, _id: checkin._id, userId: user._id, isSynthetic },
        assessment: { ...result, _id: assessment._id, ai },
        consent,
    });

    consent.latestCategory = result.category;
    consent.latestScore = result.score;
    consent.lastCheckinAt = checkin.createdAt;
    consent.checkinCount = (consent.checkinCount || 0) + 1;
    await consent.save();

    if (!isSynthetic) await rescheduleForUser(user._id, { lastCheckinAt: checkin.createdAt });

    return { checkin, assessment, alertResult, ai };
}

module.exports = { parseCheckinInput, submitCheckin, ENUMS };
