// counselorDirectory – listing rules, demo records, genuine ratings and public serialisation.
const Counselor = require('../models/Counselor');
const Feedback = require('../models/Feedback');

const demoEnabled = () => process.env.DEMO_COUNSELLORS_ENABLED !== 'false';

/** Profiles that may be shown publicly: admin-verified professionals, plus clearly labelled demo profiles. */
function listableFilter({ includeDemo = true } = {}) {
  const or = [{ verificationStatus: 'verified', isDemo: { $ne: true } }];
  if (includeDemo && demoEnabled()) or.push({ isDemo: true, verificationStatus: { $ne: 'suspended' } });
  return { $or: or };
}

// The six sample profiles that earlier builds auto-seeded are fictional. They stay available ONLY as demo
// records: never "verified", invented ratings hidden, availability shown as unverified.
const DEMO_PROFILES = [
  { name: 'Dr. Asha Mehta', modes: ['online', 'offline'], days: [1, 3, 5], slots: ['10:00-11:00', '16:00-17:00'] },
  { name: 'Rahul Verma', modes: ['offline'], days: [2, 4], slots: ['09:00-10:00', '18:00-19:00'] },
  { name: 'Dr. Neha Rao', modes: ['online'], days: [1, 2, 4], slots: ['11:00-12:00', '15:00-16:00'] },
  { name: 'Kavya Singh', modes: ['online', 'offline'], days: [3, 6], slots: ['12:00-13:00', '17:00-18:00'] },
  { name: 'Sameer Kulkarni', modes: ['online'], days: [1, 5], slots: ['10:30-11:30', '19:00-20:00'] },
  { name: 'Dr. Meera Iyer', modes: ['offline', 'online'], days: [2, 4, 6], slots: ['08:00-09:00', '14:00-15:00'] },
];

let ready = null;
/** Idempotently labels the legacy sample profiles as demo records (non-destructive update). */
function ensureDirectory() {
  if (!ready) {
    ready = (async () => {
      await Counselor.init();
      for (const d of DEMO_PROFILES) {
        await Counselor.updateMany(
          { name: d.name, isDemo: { $ne: true }, verifiedBy: { $exists: false } },
          { $set: { isDemo: true, verificationStatus: 'pending', consultationModes: d.modes, weeklySlots: d.days.map((day) => ({ day, slots: d.slots })), availabilityVerifiedAt: null } }
        );
      }
      // Backfill normalised city for older records
      const missing = await Counselor.find({ cityNormalized: { $exists: false } }).select('city').lean();
      for (const c of missing) await Counselor.updateOne({ _id: c._id }, { $set: { cityNormalized: String(c.city || '').trim().toLowerCase() } });
    })().catch((err) => { ready = null; throw err; });
  }
  return ready;
}

/** Recomputes the genuine rating from feedback by users who booked this counsellor. */
async function refreshCounselorRating(counselorId) {
  const [agg] = await Feedback.aggregate([
    { $match: { 'related.type': 'counselor', 'related.id': counselorId } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Counselor.updateOne({ _id: counselorId }, { $set: { ratingAverage: agg ? Math.round(agg.avg * 10) / 10 : null, ratingCount: agg ? agg.count : 0 } });
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function publicProfile(c) {
  const availabilityVerified = !!c.availabilityVerifiedAt && !c.isDemo;
  return {
    _id: c._id,
    name: c.name,
    city: c.city,
    specialization: c.specialization || [],
    qualifications: c.qualifications || '',
    certifications: c.certifications || '',
    experienceYears: c.experienceYears ?? null,
    languages: c.languages || [],
    consultationModes: c.consultationModes?.length ? c.consultationModes : [],
    feePerHour: c.feePerHour ?? null,
    profilePhoto: c.profilePhoto || null,
    bio: c.bio || '',
    isDemo: !!c.isDemo,
    verified: c.verificationStatus === 'verified' && !c.isDemo,
    verifiedAt: c.verificationStatus === 'verified' && !c.isDemo ? c.verifiedAt : null,
    weeklySlots: (c.weeklySlots || []).filter((w) => w.slots?.length).sort((a, b) => a.day - b.day)
      .map((w) => ({ day: w.day, dayName: DAY_NAMES[w.day], slots: w.slots })),
    availability: {
      status: c.isDemo ? 'demo' : availabilityVerified ? 'verified' : 'unverified',
      verifiedAt: availabilityVerified ? c.availabilityVerifiedAt : null,
    },
    // Genuine ratings only – null when nobody has rated yet
    rating: c.ratingCount > 0 ? { average: c.ratingAverage, count: c.ratingCount } : null,
  };
}

module.exports = { ensureDirectory, listableFilter, refreshCounselorRating, publicProfile, DAY_NAMES, DEMO_PROFILES };
