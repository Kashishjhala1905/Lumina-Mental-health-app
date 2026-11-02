// Admin-managed counsellor directory. Only admins can create or modify directory profiles.
// "verified" must reflect a real credential check by the admin; availability is "verified" only when the
// admin confirms it. Profiles are suspended, never deleted.
const mongoose = require('mongoose');
const Counselor = require('../models/Counselor');
const User = require('../models/User');
const { auditLog } = require('../services/auditService');
const { publicProfile } = require('../services/counselorDirectory');
const { ensureCounselors } = require('./counselingController');

const str = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const list = (v, max = 12) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
  .map((x) => str(x, 60)).filter(Boolean).slice(0, max);

/** Validates profile input. partial=true for updates. */
function readProfile(body, { partial = false } = {}) {
  const out = {};
  const errors = {};
  const want = (k) => !partial || body[k] !== undefined;
  if (want('name')) { out.name = str(body.name, 100); if (!out.name) errors.name = 'Name is required'; }
  if (want('city')) { out.city = str(body.city, 60); if (!out.city) errors.city = 'City is required'; }
  if (want('specialization')) { out.specialization = list(body.specialization); if (!out.specialization.length) errors.specialization = 'Add at least one specialization'; }
  if (want('languages')) out.languages = list(body.languages);
  if (want('qualifications')) out.qualifications = str(body.qualifications, 300);
  if (want('certifications')) out.certifications = str(body.certifications, 300);
  if (want('bio')) out.bio = str(body.bio, 1000);
  if (want('profilePhoto')) {
    out.profilePhoto = str(body.profilePhoto, 300);
    if (out.profilePhoto && !/^(https:\/\/|\/)/.test(out.profilePhoto)) errors.profilePhoto = 'Photo must be an https:// URL or a site path';
  }
  if (want('experienceYears') && body.experienceYears !== '' && body.experienceYears !== null) {
    const n = Number(body.experienceYears);
    if (!Number.isInteger(n) || n < 0 || n > 70) errors.experienceYears = 'Experience must be 0–70 years'; else out.experienceYears = n;
  }
  if (want('feePerHour') && body.feePerHour !== '' && body.feePerHour !== null && body.feePerHour !== undefined) {
    const n = Number(body.feePerHour);
    if (!Number.isFinite(n) || n < 0) errors.feePerHour = 'Fee must be a positive number'; else out.feePerHour = n;
  }
  if (want('consultationModes')) {
    out.consultationModes = list(body.consultationModes).map((m) => m.toLowerCase()).filter((m) => ['online', 'offline'].includes(m));
    if (!out.consultationModes.length) errors.consultationModes = 'Choose online, offline or both';
  }
  if (want('weeklySlots')) {
    if (!Array.isArray(body.weeklySlots)) errors.weeklySlots = 'Invalid availability';
    else {
      out.weeklySlots = [];
      for (const w of body.weeklySlots.slice(0, 7)) {
        const day = Number(w?.day);
        const slots = list(w?.slots, 12);
        if (!Number.isInteger(day) || day < 0 || day > 6) { errors.weeklySlots = 'Invalid weekday'; break; }
        const bad = slots.find((s) => !Counselor.SLOT_RE.test(s));
        if (bad) { errors.weeklySlots = `Invalid time slot "${bad}" – use HH:MM-HH:MM`; break; }
        if (slots.length) out.weeklySlots.push({ day, slots });
      }
    }
  }
  return { out, errors };
}

const adminView = (c) => ({
  ...publicProfile(c),
  verificationStatus: c.verificationStatus,
  verifiedAt: c.verifiedAt,
  availabilityVerifiedAt: c.availabilityVerifiedAt,
  userId: c.userId || null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

// GET /api/admin/counsellors?status=&q=
const listProfiles = async (req, res) => {
  await ensureCounselors();
  const filter = {};
  if (['pending', 'verified', 'suspended'].includes(req.query.status)) filter.verificationStatus = req.query.status;
  if (req.query.demo === 'true') filter.isDemo = true;
  if (req.query.demo === 'false') filter.isDemo = { $ne: true };
  const q = str(req.query.q, 60);
  if (q) filter.$or = [{ name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { cityNormalized: { $regex: `^${q.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }];
  const rows = await Counselor.find(filter).sort({ isDemo: 1, verificationStatus: 1, name: 1 }).limit(200).lean();
  const counselorAccounts = await User.find({ role: 'counselor', isApproved: true }).select('name email').lean();
  res.json({ success: true, data: rows.map(adminView), counselorAccounts });
};

// POST /api/admin/counsellors
const createProfile = async (req, res) => {
  const { out, errors } = readProfile(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
  const profile = new Counselor({ ...out, isDemo: false, verificationStatus: 'pending' });
  if (req.body.userId && mongoose.isValidObjectId(req.body.userId) && await User.exists({ _id: req.body.userId, role: 'counselor' })) profile.userId = req.body.userId;
  if (req.body.verify === true) Object.assign(profile, { verificationStatus: 'verified', verifiedAt: new Date(), verifiedBy: req.user._id });
  if (req.body.availabilityVerified === true && out.weeklySlots?.length) Object.assign(profile, { availabilityVerifiedAt: new Date(), availabilityVerifiedBy: req.user._id });
  await profile.save();
  await auditLog({ action: 'COUNSELLOR_PROFILE_CREATED', actor: req.user, entityType: 'Counselor', entityId: profile._id, metadata: { verified: profile.verificationStatus === 'verified', city: profile.city } });
  res.status(201).json({ success: true, message: 'Counsellor profile created', data: adminView(profile.toObject()) });
};

// PATCH /api/admin/counsellors/:id   { ...fields, verificationStatus?, availabilityVerified? }
const updateProfile = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
  const profile = await Counselor.findById(req.params.id);
  if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });
  const { out, errors } = readProfile(req.body, { partial: true });
  if (Object.keys(errors).length) return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
  Object.assign(profile, out);

  const changes = Object.keys(out);
  if (req.body.verificationStatus !== undefined) {
    const next = req.body.verificationStatus;
    if (!['pending', 'verified', 'suspended'].includes(next)) return res.status(400).json({ success: false, message: 'Invalid verification status' });
    if (next === 'verified' && profile.isDemo) return res.status(409).json({ success: false, message: 'Demo profiles are fictional and can never be marked verified.' });
    profile.verificationStatus = next;
    if (next === 'verified') { profile.verifiedAt = new Date(); profile.verifiedBy = req.user._id; }
    changes.push('verificationStatus');
  }
  if (out.weeklySlots && !req.body.availabilityVerified) profile.availabilityVerifiedAt = null; // changed slots need re-verification
  if (req.body.availabilityVerified === true) {
    if (profile.isDemo) return res.status(409).json({ success: false, message: 'Demo availability cannot be verified.' });
    if (!profile.weeklySlots?.length) return res.status(400).json({ success: false, message: 'Add weekly slots before verifying availability' });
    profile.availabilityVerifiedAt = new Date();
    profile.availabilityVerifiedBy = req.user._id;
    changes.push('availabilityVerified');
  }
  if (req.body.availabilityVerified === false) profile.availabilityVerifiedAt = null;
  if (req.body.userId !== undefined) {
    if (req.body.userId && !(mongoose.isValidObjectId(req.body.userId) && await User.exists({ _id: req.body.userId, role: 'counselor' }))) {
      return res.status(400).json({ success: false, message: 'Linked account must be an approved counselor' });
    }
    profile.userId = req.body.userId || undefined;
  }
  await profile.save();
  await auditLog({ action: 'COUNSELLOR_PROFILE_UPDATED', actor: req.user, entityType: 'Counselor', entityId: profile._id, metadata: { changes, status: profile.verificationStatus } });
  res.json({ success: true, message: 'Counsellor profile updated', data: adminView(profile.toObject()) });
};

module.exports = { listProfiles, createProfile, updateProfile };
