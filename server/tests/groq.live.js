// Live check of the real Groq integration (uses GROQ_API_KEY from server/.env). Not part of `npm test`.
// Run: npm run test:groq
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { analyzeComment } = require('../services/aiAnalysisService');

(async () => {
    const comment = 'Since the attack on our village I am scared to go outside. I barely sleep and I feel nobody can help us. I would like to talk to someone.';
    const started = Date.now();
    const result = await analyzeComment(comment);
    console.log(JSON.stringify({ ...result, elapsedMs: Date.now() - started }, null, 2));
    const ok = result.status === 'completed'
        && Array.isArray(result.emotionalIndicators)
        && ['low', 'medium', 'high'].includes(result.confidence)
        && result.evidence.every((e) => comment.toLowerCase().includes(e.toLowerCase()));
    console.log(ok ? '✅ Groq structured analysis OK' : `❌ Groq analysis not completed (status: ${result.status}, reason: ${result.reason})`);
    process.exit(ok ? 0 : 1);
})();
