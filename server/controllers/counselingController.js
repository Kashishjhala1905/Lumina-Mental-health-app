// Counselling discovery & bookings (directory profiles). Listing rules live in services/counselorDirectory.js.
const mongoose = require('mongoose');
const Counselor = require('../models/Counselor');
const Booking = require('../models/Booking');
const { ensureDirectory, listableFilter, publicProfile, DAY_NAMES, DEMO_PROFILES } = require('../services/counselorDirectory');

// Fictional DEMO profiles for fresh installs (labelled "Demo profile" everywhere; no ratings; unverified availability)
const DEMO_SEEDS = [
  { name: 'Dr. Asha Mehta', city: 'Indore', specialization: ['Anxiety', 'Student Counseling'], experienceYears: 8, languages: ['Hindi', 'English'], feePerHour: 1200, bio: 'Works with students and young professionals on anxiety, transitions, and self-confidence.', qualifications: 'M.Phil Clinical Psychology', certifications: 'CBT Practitioner, Mindfulness-Based Stress Reduction' },
  { name: 'Rahul Verma', city: 'Bhopal', specialization: ['Stress Management', 'Career Counseling'], experienceYears: 6, languages: ['Hindi', 'English'], feePerHour: 900, bio: 'Focused on practical coping plans for workplace stress, exams, and career uncertainty.', qualifications: 'MA Counseling Psychology', certifications: 'Career Guidance Facilitator' },
  { name: 'Dr. Neha Rao', city: 'Mumbai', specialization: ['Depression', 'Trauma Therapy'], experienceYears: 12, languages: ['English', 'Hindi', 'Marathi'], feePerHour: 3000, bio: 'Trauma-informed therapist supporting mood, grief, and emotional recovery.', qualifications: 'PhD Psychology', certifications: 'EMDR Level 2, Trauma-Focused CBT' },
  { name: 'Kavya Singh', city: 'Delhi', specialization: ['Relationship Counseling', 'Emotional Regulation'], experienceYears: 7, languages: ['Hindi', 'English', 'Punjabi'], feePerHour: 1800, bio: 'Helps clients navigate boundaries, communication, and emotional awareness.', qualifications: 'MA Clinical Psychology', certifications: 'Gottman Method Level 1' },
  { name: 'Sameer Kulkarni', city: 'Pune', specialization: ['Career Counseling', 'Burnout Prevention'], experienceYears: 5, languages: ['English', 'Hindi', 'Marathi'], feePerHour: 1000, bio: 'Supports sustainable motivation, habit planning, and burnout prevention.', qualifications: 'PG Diploma Counseling', certifications: 'Solution-Focused Brief Therapy' },
  { name: 'Dr. Meera Iyer', city: 'Bangalore', specialization: ['Anxiety', 'Depression', 'Stress Management'], experienceYears: 10, languages: ['English', 'Hindi', 'Kannada'], feePerHour: 2500, bio: 'Integrates CBT and mindfulness for anxiety, mood, and high-pressure routines.', qualifications: 'PsyD Clinical Psychology', certifications: 'CBT Advanced, ACT Practitioner' },
];

let seeded = null;
async function ensureCounselors() {
  if (!seeded) {
    seeded = (async () => {
      if (await Counselor.countDocuments() === 0) {
        for (const d of DEMO_SEEDS) {
          const p = DEMO_PROFILES.find((x) => x.name === d.name);
          const schedule = p ? { consultationModes: p.modes, weeklySlots: p.days.map((day) => ({ day, slots: p.slots })) } : {};
          await Counselor.updateOne({ name: d.name, isDemo: true }, { $setOnInsert: { ...d, ...schedule, isDemo: true, verificationStatus: 'pending', profilePhoto: '/placeholder-user.jpg' } }, { upsert: true });
        }
      }
      await ensureDirectory(); // labels legacy samples as demo, sets modes/availability, backfills cities
    })().catch((err) => { seeded = null; throw err; });
  }
  return seeded;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const str = (v, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Builds the Mongo filter for a public search. */
function buildSearch(q) {
  const and = [listableFilter({ includeDemo: q.includeDemo !== 'false' })];
  const city = str(q.city).toLowerCase();
  if (city) and.push({ cityNormalized: { $regex: `^${escapeRe(city)}` } });
  if (str(q.specialization)) and.push({ specialization: str(q.specialization) });
  if (['online', 'offline'].includes(q.mode)) and.push({ consultationModes: q.mode });
  if (str(q.language)) and.push({ languages: str(q.language) });
  if (q.availability === 'verified') and.push({ availabilityVerifiedAt: { $ne: null }, isDemo: { $ne: true }, 'weeklySlots.0': { $exists: true } });
  if (/^[0-6]$/.test(String(q.day ?? ''))) and.push({ weeklySlots: { $elemMatch: { day: Number(q.day), 'slots.0': { $exists: true } } } });
  const minRating = Number(q.minRating);
  if (minRating > 0) and.push({ ratingCount: { $gt: 0 }, ratingAverage: { $gte: minRating } });
  return { $and: and };
}

// GET /api/counseling/counselors?city=&specialization=&mode=&language=&availability=verified&day=&minRating=&includeDemo=&page=&limit=
const getCounselors = async (req, res) => {
  await ensureCounselors();
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 24);
  const filter = buildSearch(req.query);
  const [total, rows] = await Promise.all([
    Counselor.countDocuments(filter),
    // Verified professionals first, then demo profiles
    Counselor.find(filter).sort({ isDemo: 1, ratingCount: -1, experienceYears: -1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  res.json({ success: true, count: rows.length, data: rows.map(publicProfile), pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
};

// GET /api/counseling/meta – values for the search filters (from listable profiles only)
const getMeta = async (req, res) => {
  await ensureCounselors();
  const filter = listableFilter({ includeDemo: req.query.includeDemo !== 'false' });
  const [cities, specializations, languages, verifiedCount, demoCount, rated] = await Promise.all([
    Counselor.distinct('city', filter),
    Counselor.distinct('specialization', filter),
    Counselor.distinct('languages', filter),
    Counselor.countDocuments({ verificationStatus: 'verified', isDemo: { $ne: true } }),
    Counselor.countDocuments({ isDemo: true, verificationStatus: { $ne: 'suspended' } }),
    Counselor.exists({ ...filter, ratingCount: { $gt: 0 } }),
  ]);
  const sort = (a) => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y));
  res.json({ success: true, data: { cities: sort(cities), specializations: sort(specializations), languages: sort(languages), modes: ['online', 'offline'], days: DAY_NAMES, verifiedCount, demoCount, ratingsAvailable: !!rated } });
};

// GET /api/counseling/counselors/:id
const getCounselor = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid counsellor id' });
  await ensureCounselors();
  const counselor = await Counselor.findOne({ _id: req.params.id, ...listableFilter() }).lean();
  if (!counselor) return res.status(404).json({ success: false, message: 'Counselor not found' });
  res.json({ success: true, data: publicProfile(counselor) });
};

// POST /api/counseling/bookings   { counselorId, date: 'YYYY-MM-DD', timeSlot, concern? }
const createBooking = async (req, res) => {
  const { counselorId, date, timeSlot } = req.body;
  if (!counselorId || !date || !timeSlot) {
    return res.status(400).json({ success: false, message: 'Please select counselor, date, and time slot' });
  }
  if (!mongoose.isValidObjectId(counselorId)) return res.status(400).json({ success: false, message: 'Invalid counsellor' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ success: false, message: 'Please choose a valid date' });
  const day = new Date(`${date}T00:00:00.000Z`);
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  if (Number.isNaN(day.getTime()) || day < today) return res.status(400).json({ success: false, message: 'Please choose today or a future date' });

  const counselor = await Counselor.findOne({ _id: counselorId, ...listableFilter() }).lean();
  if (!counselor) return res.status(404).json({ success: false, message: 'Counselor not found' });
  const weekday = (counselor.weeklySlots || []).find((w) => w.day === day.getUTCDay());
  if (counselor.weeklySlots?.length && !weekday?.slots?.includes(timeSlot)) {
    return res.status(400).json({ success: false, message: `${counselor.name} has no ${timeSlot} slot on ${DAY_NAMES[day.getUTCDay()]}. Please pick one of the listed slots.` });
  }

  const existing = await Booking.findOne({ counselor: counselorId, date: day, timeSlot, status: { $ne: 'cancelled' } });
  if (existing) return res.status(409).json({ success: false, message: 'This time slot is already booked' });

  try {
    const booking = await Booking.create({ user: req.user.id, counselor: counselorId, date: day, timeSlot, concern: str(req.body.concern, 1000), status: 'pending' });
    res.status(201).json({
      success: true,
      message: counselor.isDemo
        ? 'Demo booking saved. This is a fictional demo profile – no real session will take place.'
        : 'Booking request sent. The session is pending until the counsellor confirms it.',
      data: booking,
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'This time slot is already booked' });
    throw err;
  }
};

// GET /api/counseling/bookings/my
const getMyBookings = async (req, res) => {
  const bookings = await Booking.find({ user: req.user.id }).populate('counselor').sort({ date: 1, createdAt: -1 }).lean();
  res.json({ success: true, count: bookings.length, data: bookings.map((b) => ({ ...b, counselor: b.counselor ? publicProfile(b.counselor) : null })) });
};

module.exports = {
  getCounselors,
  getMeta,
  getCounselor,
  createBooking,
  getMyBookings,
  ensureCounselors,
};
