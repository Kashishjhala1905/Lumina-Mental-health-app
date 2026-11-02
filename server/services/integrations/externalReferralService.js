// externalReferralService – the single seam for any future authorised integration with government
// services or helplines.
//
// CURRENT STATE: no official API specifications or authorised credentials are available, so NO adapters are
// registered and nothing is ever transmitted externally. Referrals are handled manually by counselors.
//
// To add an authorised integration later, register an adapter implementing:
//   {
//     key:          string           // must match a config/supportDirectory.js id
//     name:         string
//     isConfigured(): boolean        // credentials present in server-side env vars
//     buildPayload(referral): object // MINIMUM necessary data, per the provider's documented spec
//     submit(payload): Promise<{ externalReference: string }>   // throw on failure
//   }
// Adapters must follow the provider's published API documentation, keep credentials in env vars only,
// validate responses, and never send check-in answers, comments, AI analysis or counselor notes.
const { SUPPORT_DIRECTORY, findDirectoryEntry } = require('../../config/supportDirectory');
const { auditLog } = require('../auditService');

const adapters = new Map(); // intentionally empty – see header comment

function registerAdapter(adapter) {
    for (const fn of ['isConfigured', 'buildPayload', 'submit']) {
        if (typeof adapter?.[fn] !== 'function') throw new Error(`Integration adapter is missing ${fn}()`);
    }
    if (!findDirectoryEntry(adapter.key)) throw new Error(`Unknown directory entry: ${adapter.key}`);
    adapters.set(adapter.key, adapter);
}

/** Integration status for a directory entry. */
function integrationStatus(directoryId) {
    const adapter = directoryId ? adapters.get(directoryId) : null;
    if (adapter && adapter.isConfigured()) return { available: true, status: 'connected', label: `Connected via ${adapter.name}` };
    return {
        available: false,
        status: 'not_connected',
        label: 'Not connected – no authorised API. Contact the service manually using the official details.',
    };
}

/** Directory with live integration status (for counselor UI). */
function listDirectory() {
    return SUPPORT_DIRECTORY.map((entry) => ({ ...entry, integration: integrationStatus(entry.id) }));
}

/**
 * Attempts an external submission. Never sends anything unless an authorised adapter is configured
 * AND the user has explicitly consented to sharing for this referral.
 * @returns {Promise<{status: 'not_available'|'consent_required'|'submitted'|'failed', message: string, externalReference?: string}>}
 */
async function submitReferral(referral, { actor } = {}) {
    const directoryId = referral.organization?.directoryId;
    const adapter = directoryId ? adapters.get(directoryId) : null;
    const log = (result, extra = {}) => auditLog({
        action: 'EXTERNAL_REFERRAL_ATTEMPT',
        actor,
        targetUserId: referral.userId,
        caseRef: referral.caseRef,
        entityType: 'Referral',
        entityId: referral._id,
        metadata: { referralRef: referral.referralRef, directoryId: directoryId || null, result, ...extra },
    });

    if (!adapter || !adapter.isConfigured()) {
        await log('not_available');
        return { status: 'not_available', message: 'No authorised external integration is available for this service. Please contact it manually using the official details.' };
    }
    if (!referral.userConsentToShare) {
        await log('consent_required');
        return { status: 'consent_required', message: 'The user has not consented to sharing their details with this organisation.' };
    }
    try {
        const payload = adapter.buildPayload(referral);
        const { externalReference } = await adapter.submit(payload);
        if (!externalReference) throw new Error('Integration response did not include a reference');
        await log('submitted', { provider: adapter.key });
        return { status: 'submitted', externalReference: String(externalReference).slice(0, 120), message: `Submitted to ${adapter.name}` };
    } catch (err) {
        await log('failed', { provider: adapter.key, errorType: err.name || 'Error' });
        return { status: 'failed', message: 'The external service could not be reached. The referral remains with your counselor.' };
    }
}

module.exports = { registerAdapter, integrationStatus, listDirectory, submitReferral, _adapters: adapters };
