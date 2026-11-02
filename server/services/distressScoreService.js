// distressScoreService – transparent, configurable, rule-based monitoring score.
// PROTOTYPE monitoring indicator, not a clinically validated diagnostic tool.
// AI output is deliberately NOT an input: the category is determined only by the rules below.
const fs = require('fs');
const path = require('path');

const RULES_PATH = path.join(__dirname, '..', 'config', 'distressRules.json');

function loadRules() {
    return JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
}

let rules = loadRules();

const getRules = () => rules;
/** Re-read the rules file (used by tests / after editing the config). */
const reloadRules = () => { rules = loadRules(); return rules; };

const categoryNames = () => rules.categories.map((c) => c.name);
const categoryRank = (name) => categoryNames().indexOf(name);

function categoryForScore(score) {
    let result = rules.categories[0].name;
    for (const c of rules.categories) {
        if (score >= c.min) result = c.name;
    }
    return result;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Deterministic crisis-language check on the optional comment (works without any AI). */
function detectCrisisLanguage(text) {
    if (!text) return [];
    const normalized = String(text).toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ');
    return (rules.crisisPhrases || []).filter((phrase) =>
        new RegExp(`(^|[^a-z])${escapeRegex(phrase.toLowerCase())}($|[^a-z])`).test(normalized)
    );
}

const SCALE_LABELS = {
    emotionalState: 'Emotional state',
    stressLevel: 'Stress level',
    anxietyLevel: 'Anxiety level',
    sleepQuality: 'Sleep quality',
    dailyFunctioning: 'Daily functioning',
};

/** Points for this check-in's answers alone. */
function scoreAnswers(checkin, crisisMatches) {
    const { factors: cfg, scale } = rules;
    const factors = [];
    const skipped = [];

    for (const key of Object.keys(SCALE_LABELS)) {
        const rule = cfg[key];
        const value = checkin[key];
        if (value === null || value === undefined) { skipped.push(SCALE_LABELS[key]); continue; }
        const steps = rule.direction === 'lowerIsWorse' ? scale.max - value : value - scale.min;
        const points = Math.max(0, steps) * rule.pointsPerStep;
        if (points > 0) {
            factors.push({ key, label: rule.label, points, detail: `${SCALE_LABELS[key]} reported as ${value}/5` });
        }
    }

    for (const key of ['socialSupport', 'safetyConcern', 'needsProfessionalHelp']) {
        const value = checkin[key];
        if (!value || value === 'prefer_not_to_say') { skipped.push(key); continue; }
        const points = cfg[key].points[value] || 0;
        if (points > 0) {
            factors.push({ key, label: cfg[key].label, points, detail: `Answer: ${value.replace(/_/g, ' ')}` });
        }
    }

    if (checkin.requestCounselorContact) {
        const points = cfg.requestCounselorContact.points;
        factors.push({ key: 'requestCounselorContact', label: cfg.requestCounselorContact.label, points, detail: 'You asked for a counselor to contact you' });
    }

    if (crisisMatches.length) {
        // Recorded as a transparent factor with 0 points; it acts through the category override instead.
        factors.push({ key: 'crisisLanguage', label: 'Crisis-related wording in comment', points: 0, detail: 'Rule-based phrase match in the optional comment' });
    }

    const baseScore = Math.min(100, factors.reduce((sum, f) => sum + f.points, 0));
    return { baseScore, factors, skipped };
}

/**
 * Calculate the monitoring score for a check-in.
 * @param {object} checkin   plain check-in values (comments as plain text)
 * @param {Array}  previous  previous assessments for this user, newest first ({ baseScore, score, category })
 */
function calculateAssessment(checkin, previous = []) {
    const crisisMatches = detectCrisisLanguage(checkin.comments);
    const { baseScore, factors, skipped } = scoreAnswers(checkin, crisisMatches);
    const long = rules.longitudinal;

    // Longitudinal comparison against the average of recent check-ins
    const recent = previous.slice(0, long.lookback);
    let trend = { direction: 'baseline', delta: null, comparedToAverage: null, basedOnCheckins: 0 };
    let score = baseScore;
    if (recent.length) {
        const avg = recent.reduce((s, a) => s + (a.baseScore ?? a.score), 0) / recent.length;
        const delta = Math.round((baseScore - avg) * 10) / 10;
        const direction = delta > long.stableBand ? 'worsening' : delta < -long.stableBand ? 'improving' : 'stable';
        trend = { direction, delta, comparedToAverage: Math.round(avg * 10) / 10, basedOnCheckins: recent.length };

        if (delta >= long.deteriorationDelta) {
            score += long.deteriorationPoints;
            factors.push({
                key: 'deterioration',
                label: 'Significant deterioration',
                points: long.deteriorationPoints,
                detail: `Answers score ${delta} points higher than the average of your last ${recent.length} check-in(s)`,
            });
        }
    }

    const sustainedWindow = previous.slice(0, long.sustainedCount);
    if (sustainedWindow.length === long.sustainedCount && sustainedWindow.every((a) => long.sustainedCategories.includes(a.category))) {
        score += long.sustainedPoints;
        factors.push({
            key: 'sustained',
            label: 'Sustained elevated concern',
            points: long.sustainedPoints,
            detail: `Previous ${long.sustainedCount} check-ins were High Concern or above`,
        });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    let category = categoryForScore(score);

    // Explicit, configurable overrides (minimum categories)
    const overridesApplied = [];
    const overrideInput = { ...checkin, crisisLanguageDetected: crisisMatches.length > 0 };
    for (const o of rules.overrides || []) {
        if (overrideInput[o.field] === o.equals && categoryRank(o.minimumCategory) > categoryRank(category)) {
            category = o.minimumCategory;
            overridesApplied.push(o.reason);
        }
    }

    const previousCategory = previous[0]?.category || null;
    const top = [...factors].filter((f) => f.points > 0).sort((a, b) => b.points - a.points).slice(0, 4);
    const parts = [
        `Monitoring score ${score}/100 → ${category}.`,
        top.length ? `Main contributing factors: ${top.map((f) => `${f.label} (+${f.points})`).join(', ')}.` : 'No elevated factors were reported.',
    ];
    if (overridesApplied.length) parts.push(`Rule overrides: ${overridesApplied.join('; ')}.`);
    if (trend.direction !== 'baseline') {
        parts.push(`Trend: ${trend.direction} (${trend.delta > 0 ? '+' : ''}${trend.delta} vs. average of last ${trend.basedOnCheckins} check-in(s)).`);
    } else {
        parts.push('This is your first check-in, so it becomes your baseline.');
    }
    if (skipped.length) parts.push(`${skipped.length} optional question(s) were skipped and scored as 0.`);
    parts.push(`Rule version ${rules.ruleVersion}. ${rules.disclaimer}`);

    return {
        score,
        baseScore,
        category,
        previousCategory,
        factors,
        overridesApplied,
        trend,
        crisisLanguageDetected: crisisMatches.length > 0,
        explanation: parts.join(' '),
        recommendedAction: rules.recommendedActions[category],
        ruleVersion: rules.ruleVersion,
    };
}

module.exports = {
    calculateAssessment,
    detectCrisisLanguage,
    categoryForScore,
    categoryRank,
    getRules,
    reloadRules,
};
