#!/usr/bin/env node
/**
 * Seeds SYNTHETIC demo data for the SIH PS 26094 demonstration. Never use real victim information.
 *
 *   node scripts/seedDemo.js                 accounts + synthetic monitoring history
 *   node scripts/seedDemo.js --accounts-only only the three demo accounts
 *
 * Idempotent: existing demo accounts are updated (password reset to DEMO_PASSWORD), and
 * synthetic history is only created once. Refuses to run with NODE_ENV=production unless --force.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const VictimSupportConsent = require('../models/VictimSupportConsent');
const WellbeingCheckin = require('../models/WellbeingCheckin');
const { generateCaseRef, assignCounselor } = require('../services/caseService');
const { submitCheckin } = require('../services/checkinService');

const args = process.argv.slice(2);
if (process.env.NODE_ENV === 'production' && !args.includes('--force')) {
    console.error('Refusing to seed demo data with NODE_ENV=production (pass --force if you really mean it).');
    process.exit(1);
}

const PASSWORD = process.env.DEMO_PASSWORD || 'LuminaDemo#2026';
const DAY = 24 * 60 * 60 * 1000;

const ACCOUNTS = [
    { username: 'demo_user', name: 'Demo User (Synthetic)', email: 'demo.user@lumina.demo', role: 'user' },
    { username: 'demo_counselor', name: 'Dr. Demo Counselor (Synthetic)', email: 'demo.counselor@lumina.demo', role: 'counselor', speciality: 'Trauma-informed care' },
    { username: 'demo_admin', name: 'Demo Admin (Synthetic)', email: 'demo.admin@lumina.demo', role: 'admin' },
];

// Synthetic, clearly fictional monitoring histories used to populate trends and aggregate analytics.
const SYNTHETIC_DISTRICTS = ['Demo District A', 'Demo District B'];
const PROFILES = {
    improving: [
        { emotionalState: 2, stressLevel: 4, anxietyLevel: 4, sleepQuality: 2, dailyFunctioning: 2, socialSupport: 'some', safetyConcern: 'safe', needsProfessionalHelp: 'yes' },
        { emotionalState: 3, stressLevel: 3, anxietyLevel: 3, sleepQuality: 3, dailyFunctioning: 3, socialSupport: 'some', safetyConcern: 'safe', needsProfessionalHelp: 'unsure' },
        { emotionalState: 4, stressLevel: 2, anxietyLevel: 2, sleepQuality: 4, dailyFunctioning: 4, socialSupport: 'strong', safetyConcern: 'safe', needsProfessionalHelp: 'no' },
    ],
    stable: [
        { emotionalState: 3, stressLevel: 3, anxietyLevel: 2, sleepQuality: 3, dailyFunctioning: 4, socialSupport: 'some', safetyConcern: 'safe', needsProfessionalHelp: 'no' },
        { emotionalState: 3, stressLevel: 3, anxietyLevel: 3, sleepQuality: 3, dailyFunctioning: 4, socialSupport: 'some', safetyConcern: 'safe', needsProfessionalHelp: 'no' },
    ],
    worsening: [
        { emotionalState: 3, stressLevel: 3, anxietyLevel: 3, sleepQuality: 3, dailyFunctioning: 3, socialSupport: 'some', safetyConcern: 'safe', needsProfessionalHelp: 'no' },
        { emotionalState: 2, stressLevel: 4, anxietyLevel: 4, sleepQuality: 2, dailyFunctioning: 3, socialSupport: 'none', safetyConcern: 'somewhat_unsafe', needsProfessionalHelp: 'unsure' },
        { emotionalState: 1, stressLevel: 5, anxietyLevel: 5, sleepQuality: 1, dailyFunctioning: 2, socialSupport: 'none', safetyConcern: 'somewhat_unsafe', needsProfessionalHelp: 'yes', requestCounselorContact: true },
    ],
};

async function upsertAccount(spec, hash) {
    let user = await User.findOne({ username: spec.username });
    if (!user) user = new User({ username: spec.username });
    Object.assign(user, {
        name: spec.name,
        email: spec.email,
        password: hash,
        role: spec.role,
        isApproved: true,
        speciality: spec.speciality,
        isDemoAccount: true,
        counselorApplication: { status: spec.role === 'counselor' ? 'approved' : 'none' },
    });
    await user.save();
    return user;
}

async function ensureConsent(user, district) {
    let consent = await VictimSupportConsent.findOne({ userId: user._id });
    if (consent) return consent;
    consent = await VictimSupportConsent.create({
        userId: user._id,
        caseRef: await generateCaseRef(),
        status: 'active',
        acknowledgements: { dataCollection: true, dataUsage: true, authorizedAccess: true, notEmergencyService: true, prototypeNotice: true },
        allowAiAnalysis: true,
        district,
        grantedAt: new Date(Date.now() - 30 * DAY),
        isSynthetic: true,
        history: [{ action: 'granted', at: new Date(Date.now() - 30 * DAY), consentVersion: VictimSupportConsent.CONSENT_VERSION }],
    });
    return consent;
}

async function seedHistory(user, consent, profile, startDaysAgo) {
    if (await WellbeingCheckin.exists({ userId: user._id })) return 0;
    const steps = PROFILES[profile];
    const gap = Math.max(Math.floor(startDaysAgo / steps.length), 1);
    for (let i = 0; i < steps.length; i++) {
        const createdAt = new Date(Date.now() - (startDaysAgo - i * gap) * DAY);
        const values = {
            sleepQuality: null, dailyFunctioning: null, socialSupport: null, safetyConcern: null, needsProfessionalHelp: null,
            requestCounselorContact: false, comments: '', ...steps[i],
        };
        await submitCheckin({ user, consent, values, isSynthetic: true, skipAi: true, createdAt });
    }
    return steps.length;
}

(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    await Promise.all([User.init(), VictimSupportConsent.init()]);
    const hash = await bcrypt.hash(PASSWORD, 12);

    const accounts = {};
    for (const spec of ACCOUNTS) accounts[spec.role] = await upsertAccount(spec, hash);
    console.log('✅ Demo accounts ready (synthetic):');
    for (const spec of ACCOUNTS) console.log(`   ${spec.role.padEnd(9)} username: ${spec.username.padEnd(15)} email: ${spec.email}`);
    console.log(`   password: ${process.env.DEMO_PASSWORD ? '(value of DEMO_PASSWORD)' : PASSWORD}`);

    if (args.includes('--accounts-only')) {
        await mongoose.disconnect();
        return;
    }

    // Synthetic cohort so trend charts and k-anonymised district analytics have data to show.
    const profiles = ['worsening', 'improving', 'stable', 'improving', 'stable', 'worsening', 'stable', 'improving', 'stable', 'improving'];
    let created = 0;
    for (let i = 0; i < profiles.length; i++) {
        const n = String(i + 1).padStart(2, '0');
        let user = await User.findOne({ username: `synthetic_case_${n}` });
        if (!user) {
            user = await User.create({
                name: `Synthetic Person ${n}`,
                username: `synthetic_case_${n}`,
                email: `synthetic.case${n}@lumina.demo`,
                password: hash,
                role: 'user',
                isDemoAccount: true,
            });
        }
        const consent = await ensureConsent(user, SYNTHETIC_DISTRICTS[i % 2]);
        if (!consent.assignedCounselor) await assignCounselor(consent, { counselorId: accounts.counselor._id });
        created += await seedHistory(user, consent, profiles[i], 28 - (i % 4) * 3);
    }
    console.log(`✅ Synthetic cohort ready: ${profiles.length} synthetic cases across ${SYNTHETIC_DISTRICTS.join(', ')} (${created} new synthetic check-ins).`);
    console.log('ℹ️  demo_user has NO check-ins yet, so the live demo can start from consent → first check-in.');
    await mongoose.disconnect();
})().catch(async (err) => {
    console.error('Seeding failed:', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
