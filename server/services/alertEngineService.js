// alertEngineService – configurable early-warning rules. Alerts are for human review only;
// nothing here contacts the user, law enforcement or any external authority.
const RiskAlert = require('../models/RiskAlert');
const { getRules, categoryRank } = require('./distressScoreService');
const { generateAlertRef, ensureAssignment } = require('./caseService');
const { auditLog } = require('./auditService');
const { notify } = require('./notificationService');

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };
const PRIORITY_RANK = { normal: 0, high: 1, urgent: 2 };

/** Determine which configured rules fire for this check-in. Pure function. */
function evaluateTriggers(checkin, assessment) {
    const cfg = getRules().alerts;
    const triggers = [];
    const thresholdRank = categoryRank(cfg.categoryThreshold);

    if (categoryRank(assessment.category) >= thresholdRank) {
        const crossed = assessment.previousCategory && categoryRank(assessment.previousCategory) < thresholdRank;
        triggers.push({
            code: 'category_threshold',
            label: `Monitoring category: ${assessment.category}`,
            detail: crossed
                ? `Crossed the alert threshold (${cfg.categoryThreshold}) – previously ${assessment.previousCategory}`
                : `At or above the alert threshold (${cfg.categoryThreshold}); score ${assessment.score}/100`,
        });
    }
    if (cfg.deterioration && assessment.factors.some((f) => f.key === 'deterioration')) {
        const f = assessment.factors.find((x) => x.key === 'deterioration');
        triggers.push({ code: 'deterioration', label: 'Significant deterioration across check-ins', detail: f.detail });
    }
    if (cfg.counselorRequest && checkin.requestCounselorContact) {
        triggers.push({ code: 'counselor_request', label: 'User requested counselor contact', detail: 'Explicit request in check-in' });
    }
    if ((cfg.safetyConcernValues || []).includes(checkin.safetyConcern)) {
        triggers.push({
            code: 'safety_concern',
            label: checkin.safetyConcern === 'unsafe' ? 'Serious personal safety concern' : 'Personal safety concern',
            detail: `User reported feeling ${checkin.safetyConcern.replace(/_/g, ' ')}`,
        });
    }
    if (cfg.crisisLanguage && assessment.crisisLanguageDetected) {
        triggers.push({ code: 'crisis_language', label: 'Crisis-related wording in comment', detail: 'Rule-based phrase match – please read the comment' });
    }
    const ai = assessment.ai || {};
    if (cfg.aiHumanReview?.enabled && ai.status === 'completed' && ai.humanReviewRecommended
        && (CONFIDENCE_RANK[ai.confidence] ?? -1) >= CONFIDENCE_RANK[cfg.aiHumanReview.minConfidence || 'high']) {
        triggers.push({ code: 'ai_review', label: 'AI suggested human review (advisory)', detail: `AI confidence: ${ai.confidence}. AI does not set the category.` });
    }
    return triggers;
}

function priorityFor(category, triggers) {
    if (category === 'Urgent Support Needed') return 'urgent';
    const codes = triggers.map((t) => t.code);
    if (category === 'High Concern' || codes.includes('safety_concern') || codes.includes('crisis_language')) return 'high';
    return 'normal';
}

const maxBy = (a, b, rank) => ((rank(b) > rank(a)) ? b : a);

/**
 * Evaluate a saved check-in + assessment and create or update an alert.
 * Duplicate prevention: one open alert per user (enforced by a partial unique index);
 * new triggers are merged into it instead of creating another alert.
 * @returns {Promise<{alert: object|null, action: 'created'|'merged'|'none', triggers: Array}>}
 */
async function processCheckin({ checkin, assessment, consent }) {
    const triggers = evaluateTriggers(checkin, assessment);
    if (!triggers.length) return { alert: null, action: 'none', triggers };

    const stamped = triggers.map((t) => ({ ...t, checkinId: checkin._id, at: new Date() }));
    const priority = priorityFor(assessment.category, triggers);
    const counselorId = await ensureAssignment(consent);
    const ai = assessment.ai || {};

    for (let attempt = 0; attempt < 2; attempt++) {
        const open = await RiskAlert.findOne({ userId: checkin.userId, isOpen: true });
        if (open) {
            if (open.checkinIds.some((id) => String(id) === String(checkin._id))) {
                return { alert: open, action: 'none', triggers }; // this event was already processed
            }
            open.triggerFactors.push(...stamped);
            open.triggerCodes = [...new Set([...open.triggerCodes, ...triggers.map((t) => t.code)])];
            open.checkinIds.push(checkin._id);
            open.latestAssessmentId = assessment._id;
            open.category = maxBy(open.category, assessment.category, categoryRank);
            open.score = assessment.score;
            open.priority = maxBy(open.priority, priority, (p) => PRIORITY_RANK[p]);
            open.occurrences += 1;
            open.lastTriggeredAt = new Date();
            open.hasNewActivity = true;
            if (counselorId) open.assignedCounselor = counselorId;
            open.aiContext = { humanReviewRecommended: !!ai.humanReviewRecommended, confidence: ai.confidence || null };
            await open.save();

            await auditLog({
                action: 'ALERT_UPDATED',
                targetUserId: checkin.userId,
                caseRef: consent.caseRef,
                entityType: 'RiskAlert',
                entityId: open._id,
                metadata: { alertRef: open.alertRef, triggerCodes: triggers.map((t) => t.code), category: assessment.category, occurrences: open.occurrences },
            });
            if (open.assignedCounselor) {
                await notify(open.assignedCounselor, {
                    type: 'alert_updated',
                    title: `Alert ${open.alertRef} has new activity`,
                    message: `New check-in on case ${consent.caseRef} triggered: ${triggers.map((t) => t.label).join('; ')}`,
                    link: `/counselor/cases/${consent.caseRef}`,
                    email: open.priority === 'urgent',
                    reference: open.alertRef,
                });
            }
            return { alert: open, action: 'merged', triggers };
        }

        try {
            const alert = await RiskAlert.create({
                alertRef: await generateAlertRef(),
                userId: checkin.userId,
                caseRef: consent.caseRef,
                checkinIds: [checkin._id],
                latestAssessmentId: assessment._id,
                category: assessment.category,
                score: assessment.score,
                priority,
                triggerFactors: stamped,
                triggerCodes: triggers.map((t) => t.code),
                status: 'New',
                isOpen: true,
                assignedCounselor: counselorId || undefined,
                statusHistory: [{ from: null, to: 'New', changedAt: new Date() }],
                aiContext: { humanReviewRecommended: !!ai.humanReviewRecommended, confidence: ai.confidence || null },
                isSynthetic: !!checkin.isSynthetic,
            });
            await auditLog({
                action: 'ALERT_CREATED',
                targetUserId: checkin.userId,
                caseRef: consent.caseRef,
                entityType: 'RiskAlert',
                entityId: alert._id,
                metadata: { alertRef: alert.alertRef, category: alert.category, score: alert.score, priority, triggerCodes: alert.triggerCodes },
            });
            if (counselorId) {
                await notify(counselorId, {
                    type: 'alert_created',
                    title: `${priority === 'urgent' ? 'URGENT: ' : ''}New alert ${alert.alertRef}`,
                    message: `Case ${consent.caseRef}: ${triggers.map((t) => t.label).join('; ')}`,
                    link: `/counselor/cases/${consent.caseRef}`,
                    dedupeKey: `alert_created:${alert._id}`,
                    email: true,
                    reference: alert.alertRef,
                });
            }
            return { alert, action: 'created', triggers };
        } catch (err) {
            // Lost a race with a concurrent check-in: loop once more and merge into the alert it created.
            if (err.code !== 11000 || attempt === 1) throw err;
        }
    }
    return { alert: null, action: 'none', triggers };
}

module.exports = { evaluateTriggers, processCheckin, priorityFor };
