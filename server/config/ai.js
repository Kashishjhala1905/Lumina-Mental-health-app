// Shared Groq configuration. Models are configurable because Groq retires models over time
// (llama-3.3-70b-versatile is no longer available, which broke the original chatbot).
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

const getChatModel = () => (process.env.GROQ_MODEL || DEFAULT_MODEL).trim();
const getAnalysisModel = () => (process.env.GROQ_ANALYSIS_MODEL || process.env.GROQ_MODEL || DEFAULT_MODEL).trim();

/** Extra request parameters for specific model families. */
const modelParams = (model) => (model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {});

const getGroqKey = () => {
    const key = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim();
    return key && key !== 'your_api_key_here' ? key : null;
};

module.exports = { GROQ_API_URL, DEFAULT_MODEL, getChatModel, getAnalysisModel, modelParams, getGroqKey };
