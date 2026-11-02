// AuditEvent – records important actions. Stores only non-sensitive metadata:
// never passwords, tokens, check-in comments or note contents.
const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema({
    action: { type: String, required: true }, // e.g. CONSENT_GRANTED, CHECKIN_SUBMITTED, CASE_ACCESSED
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null for system actions
    actorRole: { type: String, default: 'system' },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    caseRef: String,
    entityType: String,
    entityId: mongoose.Schema.Types.ObjectId,
    metadata: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: { createdAt: true, updatedAt: false } });

auditEventSchema.index({ createdAt: -1 });
auditEventSchema.index({ action: 1, createdAt: -1 });
auditEventSchema.index({ caseRef: 1, createdAt: -1 });
auditEventSchema.index({ actorId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditEvent', auditEventSchema);
