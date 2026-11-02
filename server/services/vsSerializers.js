// Role-specific views of victim-support records. Owners never receive private counselor notes;
// counselors receive decrypted content only for cases assigned to them (enforced by controllers).
const { decryptText } = require('../utils/fieldCrypto');

const id = (v) => (v ? String(v._id || v) : null);
const nameOf = (u) => (u && typeof u === 'object' && u.name ? u.name : null);

const baseCheckin = (c) => ({
    _id: id(c),
    caseRef: c.caseRef,
    emotionalState: c.emotionalState,
    stressLevel: c.stressLevel,
    anxietyLevel: c.anxietyLevel,
    safetyConcern: c.safetyConcern,
    sleepQuality: c.sleepQuality,
    dailyFunctioning: c.dailyFunctioning,
    socialSupport: c.socialSupport,
    needsProfessionalHelp: c.needsProfessionalHelp,
    requestCounselorContact: c.requestCounselorContact,
    hasComment: c.hasComment,
    comments: c.comments ? decryptText(c.comments) : '',
    isSynthetic: !!c.isSynthetic,
    createdAt: c.createdAt,
});

const baseAssessment = (a) => a && ({
    _id: id(a),
    checkinId: id(a.checkinId),
    score: a.score,
    baseScore: a.baseScore,
    category: a.category,
    previousCategory: a.previousCategory,
    factors: a.factors || [],
    overridesApplied: a.overridesApplied || [],
    trend: a.trend,
    explanation: a.explanation,
    recommendedAction: a.recommendedAction,
    crisisLanguageDetected: !!a.crisisLanguageDetected,
    ruleVersion: a.ruleVersion,
    isSynthetic: !!a.isSynthetic,
    createdAt: a.createdAt,
});

const fullAi = (ai = {}) => ({
    status: ai.status || 'skipped',
    emotionalIndicators: ai.emotionalIndicators || [],
    distressSignals: ai.distressSignals || [],
    supportNeeds: ai.supportNeeds || [],
    evidence: (ai.evidence || []).map(decryptText),
    confidence: ai.confidence || null,
    uncertaintyNotes: ai.uncertaintyNotes || [],
    humanReviewRecommended: !!ai.humanReviewRecommended,
    summary: ai.summary ? decryptText(ai.summary) : '',
    model: ai.model,
    analyzedAt: ai.analyzedAt,
    reason: ai.reason,
});

// ---------- Owner (the user themself) ----------
const checkinForOwner = baseCheckin;

const assessmentForOwner = (a) => a && ({
    ...baseAssessment(a),
    ai: {
        status: a.ai?.status || 'skipped',
        emotionalIndicators: a.ai?.emotionalIndicators || [],
        supportNeeds: a.ai?.supportNeeds || [],
        summary: a.ai?.summary ? decryptText(a.ai.summary) : '',
        reason: a.ai?.reason,
    },
});

const alertForOwner = (a) => ({
    alertRef: a.alertRef,
    status: a.status,
    category: a.category,
    priority: a.priority,
    reasons: [...new Set((a.triggerFactors || []).map((t) => t.label))],
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    resolvedAt: a.resolvedAt,
});

const planItemForOwner = (i) => ({
    _id: id(i),
    category: i.category,
    title: i.title,
    description: i.description,
    status: i.status,
    referral: i.referral?.organization ? { organization: i.referral.organization, contactInfo: i.referral.contactInfo, referredAt: i.referral.referredAt } : null,
    externallyConfirmed: !!i.externalConfirmation?.confirmed,
    followUpDate: i.followUpDate,
    updatedAt: i.updatedAt,
});

const planForOwner = (p) => ({
    _id: id(p),
    title: p.title,
    summary: p.summary,
    status: p.status,
    counselorName: nameOf(p.counselorId),
    items: (p.items || []).map(planItemForOwner),
    isSynthetic: !!p.isSynthetic,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
});

const consentForOwner = (c) => c && ({
    caseRef: c.caseRef,
    status: c.status,
    consentVersion: c.consentVersion,
    acknowledgements: c.acknowledgements,
    allowAiAnalysis: c.allowAiAnalysis,
    district: c.district || '',
    grantedAt: c.grantedAt,
    withdrawnAt: c.withdrawnAt,
    withdrawalDataChoice: c.withdrawalDataChoice,
    dataDeletedAt: c.dataDeletedAt,
    assignedCounselorName: nameOf(c.assignedCounselor),
    hasAssignedCounselor: !!c.assignedCounselor,
    checkinCount: c.checkinCount || 0,
    lastCheckinAt: c.lastCheckinAt,
    history: (c.history || []).filter((h) => h.action !== 'counselor_assigned'),
});

// ---------- Assigned counselor ----------
const checkinForCounselor = baseCheckin;

const assessmentForCounselor = (a) => a && ({ ...baseAssessment(a), ai: fullAi(a.ai) });

const alertForCounselor = (a) => ({
    _id: id(a),
    alertRef: a.alertRef,
    caseRef: a.caseRef,
    status: a.status,
    category: a.category,
    score: a.score,
    priority: a.priority,
    triggerFactors: (a.triggerFactors || []).map((t) => ({ code: t.code, label: t.label, detail: t.detail, checkinId: id(t.checkinId), at: t.at })),
    triggerCodes: a.triggerCodes || [],
    occurrences: a.occurrences,
    lastTriggeredAt: a.lastTriggeredAt,
    hasNewActivity: !!a.hasNewActivity,
    assignedCounselorName: nameOf(a.assignedCounselor),
    reviewNotes: (a.reviewNotes || []).map((n) => ({ _id: id(n), authorName: n.authorName, note: decryptText(n.note), createdAt: n.createdAt })),
    statusHistory: a.statusHistory || [],
    aiContext: a.aiContext,
    isSynthetic: !!a.isSynthetic,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    resolvedAt: a.resolvedAt,
});

const planForCounselor = (p) => ({
    ...planForOwner(p),
    caseRef: p.caseRef,
    items: (p.items || []).map((i) => ({
        ...planItemForOwner(i),
        externalConfirmation: {
            confirmed: !!i.externalConfirmation?.confirmed,
            confirmedAt: i.externalConfirmation?.confirmedAt,
            note: i.externalConfirmation?.note,
        },
        privateNote: i.privateNote ? decryptText(i.privateNote) : '',
    })),
});

const noteForCounselor = (n) => ({
    _id: id(n),
    type: n.type,
    content: decryptText(n.content),
    followUpDate: n.followUpDate,
    followUpStatus: n.followUpStatus,
    completedAt: n.completedAt,
    alertId: id(n.alertId),
    counselorName: nameOf(n.counselorId),
    createdAt: n.createdAt,
});

module.exports = {
    checkinForOwner,
    assessmentForOwner,
    alertForOwner,
    planForOwner,
    consentForOwner,
    checkinForCounselor,
    assessmentForCounselor,
    alertForCounselor,
    planForCounselor,
    noteForCounselor,
};
