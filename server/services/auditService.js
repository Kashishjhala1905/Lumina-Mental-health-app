// auditService – records audit events with sanitised, non-sensitive metadata only.
const AuditEvent = require('../models/AuditEvent');

// Keys that must never be written to the audit log
const SENSITIVE_KEYS = /^(password|currentPassword|newPassword|confirmPassword|token|secret|comments?|notes?|privateNote|content|summary|evidence|credentials?|email|text|message)$/i;

function sanitizeMetadata(metadata, depth = 0) {
    if (!metadata || typeof metadata !== 'object' || depth > 3) return undefined;
    const clean = Array.isArray(metadata) ? [] : {};
    for (const [key, value] of Object.entries(metadata)) {
        if (SENSITIVE_KEYS.test(key)) continue;
        if (value && typeof value === 'object' && !(value instanceof Date) && !value._bsontype) {
            clean[key] = sanitizeMetadata(value, depth + 1);
        } else if (typeof value === 'string') {
            clean[key] = value.slice(0, 120);
        } else {
            clean[key] = value;
        }
    }
    return clean;
}

/**
 * Log an audit event. Never throws (audit failures must not break user flows).
 * @param {object} event
 * @param {string} event.action        e.g. CONSENT_GRANTED
 * @param {object} [event.actor]       user document performing the action (omit for system)
 * @param {*}      [event.targetUserId]
 * @param {string} [event.caseRef]
 * @param {string} [event.entityType]
 * @param {*}      [event.entityId]
 * @param {object} [event.metadata]    non-sensitive key/value pairs
 */
async function auditLog({ action, actor, targetUserId, caseRef, entityType, entityId, metadata } = {}) {
    try {
        await AuditEvent.create({
            action,
            actorId: actor?._id || null,
            actorRole: actor ? (actor.role === 'student' ? 'user' : actor.role) : 'system',
            targetUserId: targetUserId || null,
            caseRef,
            entityType,
            entityId: entityId || undefined,
            metadata: sanitizeMetadata(metadata),
        });
    } catch (err) {
        console.error('Failed to write audit event:', action, err.message);
    }
}

module.exports = { auditLog, sanitizeMetadata };
