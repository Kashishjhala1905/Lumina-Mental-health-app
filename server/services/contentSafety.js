// contentSafety – checks for community posts and comments.
//  • blocks abusive language and personal contact details (protects posters from doxxing themselves)
//  • detects crisis wording (same rule set as Victim Support) so the author can be shown helplines and
//    the post flagged for a moderator – it is NOT blocked, because asking for help must stay possible.
const { detectCrisisLanguage } = require('./distressScoreService');

const ABUSIVE = ['fuck', 'fucking', 'motherfucker', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'slut', 'whore', 'retard', 'kill yourself', 'kys'];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ABUSIVE_RE = new RegExp(`(^|[^a-z])(${ABUSIVE.map(escape).join('|')})($|[^a-z])`, 'i');
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\s().-]?){10,}/; // 10+ digits, optionally separated (phone, Aadhaar-like numbers)

/** @returns {{ ok: boolean, message?: string, crisis: boolean }} */
function checkContent(text) {
  const value = String(text || '');
  if (ABUSIVE_RE.test(value)) return { ok: false, crisis: false, message: 'Please keep the community respectful and supportive – abusive language is not allowed.' };
  if (EMAIL_RE.test(value) || PHONE_RE.test(value)) {
    return { ok: false, crisis: false, message: 'For your safety, please don’t share phone numbers, email addresses or ID numbers in public posts.' };
  }
  return { ok: true, crisis: detectCrisisLanguage(value).length > 0 };
}

module.exports = { checkContent };
