// notificationService – in-app notifications, with optional discreet email copies for important events.
// Email copies are sent only when the recipient opted in (User.emailNotifications) and a provider is configured.
const Notification = require('../models/Notification');
const { sendEmail, isEmailConfigured } = require('./email/emailService');

const STAFF_ROLES = ['counselor', 'admin'];

/**
 * Create an in-app notification. Duplicate dedupeKeys are silently ignored.
 * @param {*} userId
 * @param {object} n
 * @param {boolean} [n.email]      also send a discreet email copy if the user opted in
 * @param {string}  [n.reference]  non-sensitive reference for staff emails (e.g. "AL-XXXXXX")
 * @returns {Promise<object|null>} the notification, or null when it was a duplicate
 */
async function notify(userId, { type, title, message, link, dedupeKey, email = false, reference }) {
    if (!userId) return null;
    let notification;
    try {
        notification = await Notification.create({ userId, type, title, message, link, dedupeKey });
    } catch (err) {
        if (err.code === 11000) return null;
        console.error('Failed to create notification:', err.message);
        return null;
    }
    if (email && isEmailConfigured()) {
        try {
            const User = require('../models/User');
            const user = await User.findById(userId).select('name email role emailNotifications').lean();
            if (user?.emailNotifications && user.email) {
                await sendEmail({
                    to: user.email,
                    type: 'notification',
                    userId,
                    idempotencyKey: `notification:${notification._id}`,
                    data: { name: user.name, audience: STAFF_ROLES.includes(user.role) ? 'staff' : 'user', reference: STAFF_ROLES.includes(user.role) ? reference : undefined },
                });
            }
        } catch (err) {
            console.error('Notification email failed:', err.message);
        }
    }
    return notification;
}

module.exports = { notify, isEmailConfigured };
