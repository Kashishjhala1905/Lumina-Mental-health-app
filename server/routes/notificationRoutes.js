const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// GET /api/notifications – the signed-in user's notifications (newest first)
router.get('/', async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const [items, unreadCount] = await Promise.all([
        Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(limit).select('-dedupeKey -userId').lean(),
        Notification.countDocuments({ userId: req.user._id, read: false }),
    ]);
    res.json({ success: true, data: items, unreadCount });
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res) => {
    const result = await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true, readAt: new Date() } });
    res.json({ success: true, updated: result.modifiedCount });
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid notification id' });
    const n = await Notification.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        { $set: { read: true, readAt: new Date() } },
        { new: true }
    ).select('-dedupeKey -userId').lean();
    if (!n) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, data: n });
});

module.exports = router;
