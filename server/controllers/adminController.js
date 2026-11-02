const mongoose = require('mongoose');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const VictimSupportConsent = require('../models/VictimSupportConsent');
const WellbeingCheckin = require('../models/WellbeingCheckin');
const DistressAssessment = require('../models/DistressAssessment');
const RiskAlert = require('../models/RiskAlert');
const SupportPlan = require('../models/SupportPlan');
const CaseNote = require('../models/CaseNote');
const AuditEvent = require('../models/AuditEvent');
const Referral = require('../models/Referral');
const { auditLog } = require('../services/auditService');
const { assignCounselor, ensureAssignment } = require('../services/caseService');
const { deleteVictimSupportData } = require('../services/victimDataService');
const { expandRoles } = require('../utils/roles');

const USER_ROLES = expandRoles(['user']);
// Aggregates covering fewer people than this are suppressed to reduce re-identification risk
const K_ANONYMITY = Math.max(parseInt(process.env.ANALYTICS_MIN_GROUP_SIZE, 10) || 5, 1);

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin)
const getAllUsers = async (req, res) => {
    const users = await User.find().select('-password -tokenVersion').sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: users.length, data: users });
};

// @desc    Get all appointments
// @route   GET /api/admin/appointments
// @access  Private (Admin)
const getAllAppointments = async (req, res) => {
    const appointments = await Appointment.find()
        .populate('userId', 'name email')
        .populate('counselorId', 'name email')
        .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: appointments.length, data: appointments });
};

// @desc    Delete user (and their victim-support records)
// @route   DELETE /api/admin/user/:id
// @access  Private (Admin)
const deleteUser = async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot delete admin' });

    const consent = await VictimSupportConsent.findOne({ userId: user._id });
    if (consent) {
        await deleteVictimSupportData(user._id, { actor: req.user, reason: 'account_deleted' });
        await consent.deleteOne();
    }
    if (user.role === 'counselor') {
        // Re-assign any cases this counselor held
        const held = await VictimSupportConsent.find({ assignedCounselor: user._id });
        await user.deleteOne();
        for (const c of held) { c.assignedCounselor = undefined; await c.save(); await ensureAssignment(c); }
    } else {
        await user.deleteOne();
    }
    await auditLog({ action: 'USER_DELETED', actor: req.user, targetUserId: user._id, entityType: 'User', entityId: user._id, metadata: { role: user.role } });
    res.status(200).json({ success: true, message: 'User removed' });
};

// @desc    Get system stats
// @route   GET /api/admin/stats
// @access  Private (Admin)
const getStats = async (req, res) => {
    const [userCount, counselorCount, appointmentCount, pendingAppointments, pendingCounselors] = await Promise.all([
        User.countDocuments({ role: { $in: USER_ROLES } }),
        User.countDocuments({ role: 'counselor', isApproved: true }),
        Appointment.countDocuments(),
        Appointment.countDocuments({ status: 'pending' }),
        User.countDocuments({ $or: [{ 'counselorApplication.status': 'pending' }, { role: 'counselor', isApproved: false }] }),
    ]);
    res.status(200).json({
        success: true,
        data: {
            students: userCount, // kept for backwards compatibility
            users: userCount,
            counselors: counselorCount,
            appointments: appointmentCount,
            pending: pendingAppointments,
            pendingCounselors,
        },
    });
};

// @desc    Get pending counselor applications
// @route   GET /api/admin/pending-counselors
// @access  Private (Admin)
const getPendingCounselors = async (req, res) => {
    const users = await User.find({ $or: [{ 'counselorApplication.status': 'pending' }, { role: 'counselor', isApproved: false }] })
        .select('name email username role speciality credentials counselorApplication createdAt').lean();
    const data = users.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        username: u.username,
        speciality: u.counselorApplication?.speciality || u.speciality,
        credentials: u.counselorApplication?.credentials || u.credentials,
        appliedAt: u.counselorApplication?.appliedAt || u.createdAt,
    }));
    res.status(200).json({ success: true, count: data.length, data });
};

// @desc    Approve counselor application (grants the counselor role)
// @route   PATCH /api/admin/approve-counselor/:id
// @access  Private (Admin)
const approveCounselor = async (req, res) => {
    const user = await User.findById(req.params.id);
    const isApplicant = user?.counselorApplication?.status === 'pending';
    const isLegacyPending = user?.role === 'counselor' && !user.isApproved;
    if (!user || (!isApplicant && !isLegacyPending)) {
        return res.status(404).json({ success: false, message: 'Counselor application not found' });
    }
    if (await VictimSupportConsent.exists({ userId: user._id, status: 'active' })) {
        return res.status(409).json({ success: false, message: 'This account is enrolled in Victim Support and cannot also be a counselor.' });
    }
    const fromRole = user.role;
    user.role = 'counselor';
    user.isApproved = true;
    if (isApplicant) {
        user.speciality = user.counselorApplication.speciality;
        user.credentials = user.counselorApplication.credentials;
    }
    user.counselorApplication.status = 'approved';
    user.counselorApplication.reviewedAt = new Date();
    user.counselorApplication.reviewedBy = req.user._id;
    await user.save();
    await auditLog({ action: 'COUNSELOR_APPROVED', actor: req.user, targetUserId: user._id, entityType: 'User', entityId: user._id, metadata: { from: fromRole, to: 'counselor' } });
    res.status(200).json({ success: true, message: 'Counselor approved' });
};

// @desc    Reject counselor application (the account stays as a regular user)
// @route   DELETE /api/admin/reject-counselor/:id
// @access  Private (Admin)
const rejectCounselor = async (req, res) => {
    const user = await User.findById(req.params.id);
    const isApplicant = user?.counselorApplication?.status === 'pending';
    const isLegacyPending = user?.role === 'counselor' && !user.isApproved;
    if (!user || (!isApplicant && !isLegacyPending)) {
        return res.status(404).json({ success: false, message: 'Counselor application not found' });
    }
    if (isLegacyPending) { user.role = 'user'; user.isApproved = true; }
    user.counselorApplication.status = 'rejected';
    user.counselorApplication.reviewedAt = new Date();
    user.counselorApplication.reviewedBy = req.user._id;
    await user.save();
    await auditLog({ action: 'COUNSELOR_REJECTED', actor: req.user, targetUserId: user._id, entityType: 'User', entityId: user._id });
    res.status(200).json({ success: true, message: 'Counselor application rejected' });
};

// @desc    Change a user's role (trusted administrative process)
// @route   PATCH /api/admin/users/:id/role   { role: 'user' | 'counselor' | 'admin' }
// @access  Private (Admin)
const updateUserRole = async (req, res) => {
    const { role } = req.body;
    if (!['user', 'counselor', 'admin'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Role must be user, counselor or admin' });
    }
    if (String(req.params.id) === String(req.user._id)) {
        return res.status(400).json({ success: false, message: 'You cannot change your own role' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (role !== 'user' && await VictimSupportConsent.exists({ userId: user._id, status: 'active' })) {
        return res.status(409).json({ success: false, message: 'This account is enrolled in Victim Support. Staff roles must use a separate account.' });
    }
    const from = user.role === 'student' ? 'user' : user.role;
    if (from === role) return res.json({ success: true, message: 'Role unchanged' });

    user.role = role;
    user.isApproved = true;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // force re-login with the new role
    await user.save();

    if (from === 'counselor') {
        const held = await VictimSupportConsent.find({ assignedCounselor: user._id });
        for (const c of held) { c.assignedCounselor = undefined; await c.save(); await ensureAssignment(c); }
    }
    await auditLog({ action: 'ROLE_CHANGED', actor: req.user, targetUserId: user._id, entityType: 'User', entityId: user._id, metadata: { from, to: role } });
    res.json({ success: true, message: `Role updated to ${role}` });
};

// ---------- Victim Support oversight (pseudonymous / aggregate only) ----------

function parseDateRange(query) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 180 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) to.setUTCHours(23, 59, 59, 999);
    return { from, to };
}

// @desc    Anonymised aggregate analytics for the Victim Support module
// @route   GET /api/admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&district=
// @access  Private (Admin)
const getAnalytics = async (req, res) => {
    const range = parseDateRange(req.query);
    if (!range) return res.status(400).json({ success: false, message: 'Invalid date range' });
    const district = typeof req.query.district === 'string' ? req.query.district.trim() : '';

    // Optional district scope
    let userScope = null;
    if (district) {
        const scoped = await VictimSupportConsent.find({ district: new RegExp(`^${district.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('userId').lean();
        if (scoped.length < K_ANONYMITY) {
            return res.json({
                success: true,
                data: { suppressed: true, message: `Fewer than ${K_ANONYMITY} enrolled people in this district – figures are suppressed to protect privacy.`, minGroupSize: K_ANONYMITY, filters: { ...range, district } },
            });
        }
        userScope = scoped.map((c) => c.userId);
    }
    const scope = (extra = {}) => (userScope ? { ...extra, userId: { $in: userScope } } : extra);
    const inRange = { createdAt: { $gte: range.from, $lte: range.to } };

    const [
        totalEnrolled, activeMonitoring, withdrawn, unassignedActive,
        totalCheckins, pendingAlerts, alertsByCategory, alertsByStatus,
        followUpsPending, planItemStats, monthlyCheckins, monthlyAlerts,
        latestCategoryDist, districtRaw, syntheticCheckins, referralsByStatus, referralsByCategory, referralsDue,
    ] = await Promise.all([
        VictimSupportConsent.countDocuments(scope()),
        VictimSupportConsent.countDocuments(scope({ status: 'active' })),
        VictimSupportConsent.countDocuments(scope({ status: 'withdrawn' })),
        VictimSupportConsent.countDocuments(scope({ status: 'active', assignedCounselor: null })),
        WellbeingCheckin.countDocuments(scope(inRange)),
        RiskAlert.countDocuments(scope({ isOpen: true })),
        RiskAlert.aggregate([{ $match: scope(inRange) }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
        RiskAlert.aggregate([{ $match: scope(inRange) }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
        CaseNote.countDocuments(scope({ type: 'follow_up', followUpStatus: 'pending' })),
        SupportPlan.aggregate([
            { $match: scope() },
            { $unwind: '$items' },
            { $group: { _id: { category: '$items.category', status: '$items.status' }, n: { $sum: 1 } } },
        ]),
        DistressAssessment.aggregate([
            { $match: scope(inRange) },
            { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, checkins: { $sum: 1 }, avgScore: { $avg: '$score' }, users: { $addToSet: '$userId' } } },
            { $project: { checkins: 1, avgScore: { $round: ['$avgScore', 1] }, activeUsers: { $size: '$users' } } },
            { $sort: { _id: 1 } },
        ]),
        RiskAlert.aggregate([
            { $match: scope(inRange) },
            { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, alerts: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]),
        VictimSupportConsent.aggregate([
            { $match: scope({ status: 'active', latestCategory: { $ne: null } }) },
            { $group: { _id: '$latestCategory', n: { $sum: 1 } } },
        ]),
        VictimSupportConsent.aggregate([
            { $match: scope({ district: { $nin: [null, ''] } }) },
            { $group: { _id: { $toLower: '$district' }, label: { $first: '$district' }, enrolled: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, avgLatestScore: { $avg: '$latestScore' } } },
            { $sort: { enrolled: -1 } },
        ]),
        WellbeingCheckin.countDocuments(scope({ ...inRange, isSynthetic: true })),
        Referral.aggregate([{ $match: scope() }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
        Referral.aggregate([{ $match: scope() }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
        Referral.countDocuments(scope({ status: { $nin: Referral.CLOSED_STATUSES }, followUpDate: { $lte: new Date() } })),
    ]);

    const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.n]));

    // Merge monthly series
    const months = new Map();
    for (const m of monthlyCheckins) months.set(m._id, { month: m._id, checkins: m.checkins, avgScore: m.avgScore, activeUsers: m.activeUsers, alerts: 0 });
    for (const m of monthlyAlerts) months.set(m._id, { ...(months.get(m._id) || { month: m._id, checkins: 0, avgScore: null, activeUsers: 0 }), alerts: m.alerts });
    const monthlyTrends = [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
        // suppress per-month averages based on very few people
        .map((m) => (m.activeUsers && m.activeUsers < K_ANONYMITY ? { ...m, avgScore: null, avgScoreSuppressed: true } : m));

    // District statistics with small-group suppression
    const districts = [];
    let suppressedCount = 0;
    for (const d of districtRaw) {
        if (d.enrolled >= K_ANONYMITY) districts.push({ district: d.label, enrolled: d.enrolled, active: d.active, avgLatestScore: d.avgLatestScore == null ? null : Math.round(d.avgLatestScore * 10) / 10 });
        else suppressedCount += d.enrolled;
    }

    const planStatusTotals = {};
    const planCategoryTotals = {};
    for (const row of planItemStats) {
        planStatusTotals[row._id.status] = (planStatusTotals[row._id.status] || 0) + row.n;
        planCategoryTotals[row._id.category] = (planCategoryTotals[row._id.category] || 0) + row.n;
    }

    await auditLog({ action: 'ANALYTICS_VIEWED', actor: req.user, metadata: { districtFiltered: !!district } });

    res.json({
        success: true,
        data: {
            suppressed: false,
            minGroupSize: K_ANONYMITY,
            filters: { from: range.from, to: range.to, district: district || null },
            totals: {
                totalEnrolled,
                activeMonitoring,
                withdrawn,
                unassignedActive,
                totalCheckins,
                pendingAlerts,
                followUpsPending,
                syntheticCheckins,
            },
            alertsByCategory: toMap(alertsByCategory),
            alertsByStatus: toMap(alertsByStatus),
            latestCategoryDistribution: toMap(latestCategoryDist),
            supportPlans: { byStatus: planStatusTotals, byCategory: planCategoryTotals },
            referrals: { byStatus: toMap(referralsByStatus), byCategory: toMap(referralsByCategory), followUpsDue: referralsDue, externalIntegrations: 'not_connected' },
            monthlyTrends,
            districts: { rows: districts, suppressedPeople: suppressedCount, available: districts.length > 0 },
        },
    });
};

// @desc    Pseudonymous list of victim-support cases for assignment (no names, emails or check-in content)
// @route   GET /api/admin/vs/cases
// @access  Private (Admin)
const getVictimCases = async (req, res) => {
    const cases = await VictimSupportConsent.find().populate('assignedCounselor', 'name').sort({ lastCheckinAt: -1 }).lean();
    const openAlerts = await RiskAlert.find({ isOpen: true }).select('caseRef status priority').lean();
    const alertMap = new Map(openAlerts.map((a) => [a.caseRef, a]));
    const counselors = await User.find({ role: 'counselor', isApproved: true }).select('name').lean();
    res.json({
        success: true,
        data: {
            cases: cases.map((c) => ({
                caseRef: c.caseRef,
                status: c.status,
                assignedCounselor: c.assignedCounselor ? { _id: c.assignedCounselor._id, name: c.assignedCounselor.name } : null,
                latestCategory: c.latestCategory || null,
                lastCheckinAt: c.lastCheckinAt,
                checkinCount: c.checkinCount || 0,
                openAlert: alertMap.has(c.caseRef) ? { status: alertMap.get(c.caseRef).status, priority: alertMap.get(c.caseRef).priority } : null,
                isSynthetic: !!c.isSynthetic,
            })),
            counselors,
        },
    });
};

// @desc    Assign / reassign a counselor to a case
// @route   PATCH /api/admin/vs/cases/:caseRef/assign   { counselorId }
// @access  Private (Admin)
const assignVictimCase = async (req, res) => {
    if (!mongoose.isValidObjectId(req.body.counselorId)) {
        return res.status(400).json({ success: false, message: 'Please choose a counselor' });
    }
    const consent = await VictimSupportConsent.findOne({ caseRef: String(req.params.caseRef).toUpperCase() });
    if (!consent) return res.status(404).json({ success: false, message: 'Case not found' });
    const counselor = await assignCounselor(consent, { counselorId: req.body.counselorId, actor: req.user });
    res.json({ success: true, message: `Case ${consent.caseRef} assigned to ${counselor.name}` });
};

// @desc    Audit log (metadata only). Regular users are shown by role + case reference, not by name.
// @route   GET /api/admin/audit?action=&caseRef=&page=
// @access  Private (Admin)
const getAuditEvents = async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const filter = {};
    if (typeof req.query.action === 'string' && /^[A-Z_]{3,40}$/.test(req.query.action)) filter.action = req.query.action;
    if (typeof req.query.caseRef === 'string' && /^VS-[0-9A-Z]{6}$/i.test(req.query.caseRef)) filter.caseRef = req.query.caseRef.toUpperCase();

    const [total, events, actions] = await Promise.all([
        AuditEvent.countDocuments(filter),
        AuditEvent.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('actorId', 'name role').lean(),
        AuditEvent.distinct('action'),
    ]);
    res.json({
        success: true,
        data: events.map((e) => ({
            _id: e._id,
            action: e.action,
            actorRole: e.actorRole,
            actor: ['counselor', 'admin'].includes(e.actorRole) ? (e.actorId?.name || 'Deleted account') : (e.actorRole === 'system' ? 'System' : `User${e.caseRef ? ` (${e.caseRef})` : ''}`),
            caseRef: e.caseRef,
            entityType: e.entityType,
            metadata: e.metadata,
            createdAt: e.createdAt,
        })),
        actions: actions.sort(),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
};

module.exports = {
    getAllUsers,
    getAllAppointments,
    deleteUser,
    getStats,
    getPendingCounselors,
    approveCounselor,
    rejectCounselor,
    updateUserRole,
    getAnalytics,
    getVictimCases,
    assignVictimCase,
    getAuditEvents,
};
