// Unit tests for the explainable, rule-based monitoring score, alert rules, AI output validation and timezones.
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateAssessment, detectCrisisLanguage, categoryForScore } = require('../services/distressScoreService');
const { evaluateTriggers } = require('../services/alertEngineService');
const { normalizeResult } = require('../services/aiAnalysisService');
const { computeNextReminder } = require('../services/reminderService');
const { atLocalHour, getZonedParts } = require('../utils/timezone');

const calm = {
    emotionalState: 5, stressLevel: 1, anxietyLevel: 1, sleepQuality: 5, dailyFunctioning: 5,
    socialSupport: 'strong', safetyConcern: 'safe', needsProfessionalHelp: 'no', requestCounselorContact: false, comments: '',
};
const severe = {
    emotionalState: 1, stressLevel: 5, anxietyLevel: 5, sleepQuality: 1, dailyFunctioning: 1,
    socialSupport: 'none', safetyConcern: 'safe', needsProfessionalHelp: 'yes', requestCounselorContact: false, comments: '',
};

test('category thresholds are applied in order', () => {
    assert.equal(categoryForScore(0), 'Low Concern');
    assert.equal(categoryForScore(24), 'Low Concern');
    assert.equal(categoryForScore(25), 'Moderate Concern');
    assert.equal(categoryForScore(50), 'High Concern');
    assert.equal(categoryForScore(70), 'Urgent Support Needed');
});

test('calm check-in scores 0 / Low Concern and becomes the baseline', () => {
    const r = calculateAssessment(calm, []);
    assert.equal(r.score, 0);
    assert.equal(r.category, 'Low Concern');
    assert.equal(r.trend.direction, 'baseline');
    assert.equal(r.ruleVersion, '2.0.0');
    assert.match(r.explanation, /not a clinically validated/);
});

test('every contributing factor is listed with its points (explainability)', () => {
    const r = calculateAssessment(severe, []);
    const total = r.factors.reduce((s, f) => s + f.points, 0);
    assert.equal(r.score, Math.min(100, total));
    assert.ok(r.factors.find((f) => f.key === 'stressLevel' && f.points === 16));
    assert.ok(r.factors.find((f) => f.key === 'socialSupport' && f.points === 8));
    assert.equal(r.category, 'Urgent Support Needed'); // 16*3 + 12*2 + 8 + 6 = 86
});

test('skipped optional questions score 0 and are reported', () => {
    const r = calculateAssessment({ emotionalState: 3, stressLevel: 3, anxietyLevel: 3, requestCounselorContact: false }, []);
    assert.equal(r.score, 8 + 8 + 8); // each 3/5 answer is 2 steps × 4 points
    assert.match(r.explanation, /optional question\(s\) were skipped/);
});

test('serious safety concern overrides the category to Urgent', () => {
    const r = calculateAssessment({ ...calm, safetyConcern: 'unsafe' }, []);
    assert.equal(r.score, 25);
    assert.equal(r.category, 'Urgent Support Needed');
    assert.equal(r.overridesApplied.length, 1);
});

test('deterioration versus recent average adds a longitudinal factor', () => {
    const previous = [{ baseScore: 10, score: 10, category: 'Low Concern' }, { baseScore: 12, score: 12, category: 'Low Concern' }];
    const r = calculateAssessment({ ...calm, stressLevel: 5, anxietyLevel: 5, emotionalState: 2 }, previous);
    assert.equal(r.trend.direction, 'worsening');
    assert.ok(r.factors.find((f) => f.key === 'deterioration'));
    assert.equal(r.previousCategory, 'Low Concern');
});

test('improvement is detected', () => {
    const r = calculateAssessment(calm, [{ baseScore: 60, score: 60, category: 'High Concern' }]);
    assert.equal(r.trend.direction, 'improving');
});

test('crisis phrases are matched deterministically, without AI', () => {
    assert.deepEqual(detectCrisisLanguage('Some days I want to die.'), ['want to die']);
    assert.deepEqual(detectCrisisLanguage('I slept badly but I am okay'), []);
    const r = calculateAssessment({ ...calm, comments: 'they threatened to kill my family' }, []);
    assert.equal(r.crisisLanguageDetected, true);
    assert.equal(r.category, 'High Concern');
});

test('alert triggers: threshold, counselor request, safety, crisis language', () => {
    const checkin = { ...calm, requestCounselorContact: true, safetyConcern: 'unsafe' };
    const a = calculateAssessment(checkin, []);
    const codes = evaluateTriggers(checkin, { ...a, ai: {} }).map((t) => t.code);
    assert.ok(codes.includes('category_threshold'));
    assert.ok(codes.includes('counselor_request'));
    assert.ok(codes.includes('safety_concern'));
});

test('a calm check-in triggers no alert', () => {
    const a = calculateAssessment(calm, []);
    assert.deepEqual(evaluateTriggers(calm, { ...a, ai: {} }), []);
});

test('AI never changes the category; it can only add an advisory review trigger', () => {
    const a = calculateAssessment(calm, []);
    const ai = { status: 'completed', humanReviewRecommended: true, confidence: 'high' };
    const triggers = evaluateTriggers(calm, { ...a, ai });
    assert.equal(a.category, 'Low Concern');
    assert.deepEqual(triggers.map((t) => t.code), ['ai_review']);
    const lowConf = evaluateTriggers(calm, { ...a, ai: { ...ai, confidence: 'medium' } });
    assert.deepEqual(lowConf, []);
});

test('AI output validation discards evidence that is not in the comment', () => {
    const comment = 'I feel scared to go outside and I cannot sleep.';
    const r = normalizeResult({
        emotionalIndicators: ['fear'], distressSignals: ['avoidance'], supportNeeds: [],
        evidence: ['scared to go outside', 'I want to hurt someone'], confidence: 'HIGH',
        uncertaintyNotes: [], humanReviewRecommended: true, summary: 'User reports fear and poor sleep.',
    }, comment, 'test-model');
    assert.deepEqual(r.evidence, ['scared to go outside']);
    assert.equal(r.confidence, 'high');
    assert.match(r.uncertaintyNotes.join(' '), /discarded/);
    assert.throws(() => normalizeResult('not an object', comment, 'm'));
});

test('timezone helper returns the preferred local hour', () => {
    const from = new Date('2026-03-10T12:00:00Z');
    const next = atLocalHour(from, 1, 9, 'Asia/Kolkata');
    const p = getZonedParts(next, 'Asia/Kolkata');
    assert.equal(p.hour, 9);
    assert.equal(p.day, 11);
    assert.equal(next.toISOString(), '2026-03-11T03:30:00.000Z');
});

test('next reminder respects frequency and never lies in the past', () => {
    const now = new Date('2026-05-01T10:00:00Z');
    const pref = { frequency: 'every_3_days', preferredHour: 18, timezone: 'UTC' };
    assert.equal(computeNextReminder(pref, { lastCheckinAt: now, now }).toISOString(), '2026-05-04T18:00:00.000Z');
    const overdue = computeNextReminder(pref, { lastCheckinAt: new Date('2026-01-01T00:00:00Z'), now });
    assert.equal(overdue.toISOString(), '2026-05-01T18:00:00.000Z');
});
