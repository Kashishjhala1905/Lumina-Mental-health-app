const axios = require("axios");
const mongoose = require("mongoose");
const { GROQ_API_URL, getChatModel, modelParams } = require("../config/ai");
const Conversation = require("../models/Conversation");
const { dateRange } = require('../utils/dateRange');
const { encryptText, decryptText } = require("../utils/fieldCrypto");

// Mental health focused system prompt
const SYSTEM_PROMPT = `You are Lumina's AI mental health support assistant. You are part of the Lumina platform, a digital mental health and psychological support system designed for students in higher education.

Your role is to:
- Present yourself as Lumina's AI assistant
- Listen actively and validate users' feelings
- Provide supportive, non-judgmental responses
- Offer practical coping strategies when appropriate
- Encourage professional help for serious concerns
- Maintain a warm, understanding, and professional tone
- Never provide medical diagnoses or replace professional therapy
- Focus on emotional support, mindfulness, and self-care

IMPORTANT: If asked about who created you or your origins, respond that you are Lumina's AI assistant, created by the Lumina team (Jamshed, Harmeet, and Retik) with the help of the Groq API to provide mental health support to students.

Always respond in a caring, supportive manner. Keep responses concise but meaningful (2-4 sentences typically).`;

const MAX_MESSAGE = 2000;
const CONTEXT_MESSAGES = 10;

class ChatError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

/** Calls Groq with the recent history + new message. Throws ChatError with a user-safe message. */
async function generateReply(history, message) {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey || apiKey === 'your_api_key_here') {
        throw new ChatError(500, "AI service is not configured. Please add GROQ_API_KEY to your .env file.");
    }
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.slice(-CONTEXT_MESSAGES),
        { role: "user", content: message },
    ];
    const maxRetries = parseInt(process.env.GROQ_RETRY_COUNT) || 0;
    let attempt = 0;
    let response;
    for (;;) {
        try {
            response = await axios.post(
                GROQ_API_URL,
                { model: getChatModel(), ...modelParams(getChatModel()), messages, temperature: 0.7, max_tokens: 700, stream: false },
                { headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 30000 }
            );
            break;
        } catch (err) {
            attempt++;
            const isRateLimit = err.response?.status === 429;
            const isTimeout = err.code === "ECONNABORTED";
            if (attempt > maxRetries || (!isRateLimit && !isTimeout)) {
                console.error("Chatbot error:", err.response?.status || err.code || err.message);
                if (err.response?.status === 401) throw new ChatError(401, "Invalid API key. Please check your GROQ_API_KEY.");
                if (err.response?.status === 404) {
                    console.error(`Groq model "${getChatModel()}" is unavailable. Set GROQ_MODEL to a model your key can access.`);
                    throw new ChatError(503, "The AI assistant is temporarily unavailable. Please try again later.");
                }
                if (isRateLimit) throw new ChatError(429, "Rate limit exceeded. Please try again in a moment.");
                if (isTimeout) throw new ChatError(504, "Request timeout. Please try again.");
                throw new ChatError(500, "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.");
            }
            const backoff = Math.min(1000 * attempt, 5000);
            console.warn(`Groq request failed (attempt ${attempt}/${maxRetries}). Retrying in ${backoff}ms...`);
            await new Promise((r) => setTimeout(r, backoff));
        }
    }
    const aiResponse = response.data.choices[0]?.message?.content;
    if (!aiResponse) throw new ChatError(500, "No response from AI service");
    return aiResponse.trim();
}

const cleanMessage = (m) => (typeof m === 'string' ? m.trim().slice(0, MAX_MESSAGE) : '');

// POST /api/chatbot/message – stateless chat (guests, or callers that keep their own history)
const sendMessage = async (req, res) => {
    const message = cleanMessage(req.body.message);
    if (!message) return res.status(400).json({ success: false, message: "Message is required" });
    // Only accept well-formed user/assistant turns from the client (no injected system prompts)
    const history = (Array.isArray(req.body.conversationHistory) ? req.body.conversationHistory : [])
        .filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
        .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE) }));
    try {
        const reply = await generateReply(history, message);
        res.status(200).json({ success: true, message: reply });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
};

// ---------------- Saved conversations (signed-in users; owner-only) ----------------

const toMessage = (m) => ({ _id: m._id, role: m.role, content: decryptText(m.content), createdAt: m.createdAt });
const summary = (c) => ({ _id: c._id, title: c.title, messageCount: c.messages?.length ?? c.messageCount, createdAt: c.createdAt, updatedAt: c.updatedAt, lastMessageAt: c.lastMessageAt });
const titleFrom = (text) => { const t = text.replace(/\s+/g, ' ').trim(); return t.length > 60 ? `${t.slice(0, 57)}…` : t; };

async function ownConversation(req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ success: false, message: 'Invalid conversation id' }); return null; }
    // Scoped to the owner: another user's id simply returns 404
    const conversation = await Conversation.findOne({ _id: req.params.id, user: req.user._id });
    if (!conversation) { res.status(404).json({ success: false, message: 'Conversation not found' }); return null; }
    return conversation;
}

// GET /api/chatbot/conversations?page=&limit=
const listConversations = async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const filter = { user: req.user._id };
    const range = dateRange(req.query);
    if (range) filter.lastMessageAt = range;
    const [total, rows] = await Promise.all([
        Conversation.countDocuments(filter),
        Conversation.aggregate([
            { $match: filter },
            { $sort: { lastMessageAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $project: { title: 1, createdAt: 1, updatedAt: 1, lastMessageAt: 1, messageCount: { $size: '$messages' } } },
        ]),
    ]);
    res.json({ success: true, data: rows.map(summary), pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
};

// POST /api/chatbot/conversations   { title? }
const createConversation = async (req, res) => {
    const title = cleanMessage(req.body.title).slice(0, 80) || 'New conversation';
    const conversation = await Conversation.create({ user: req.user._id, title, messages: [], lastMessageAt: new Date() });
    res.status(201).json({ success: true, data: { ...summary(conversation), messages: [] } });
};

// GET /api/chatbot/conversations/:id
const getConversation = async (req, res) => {
    const conversation = await ownConversation(req, res);
    if (!conversation) return;
    res.json({ success: true, data: { ...summary(conversation), messages: conversation.messages.map(toMessage) } });
};

// POST /api/chatbot/conversations/:id/messages   { message }
const sendConversationMessage = async (req, res) => {
    const message = cleanMessage(req.body.message);
    if (!message) return res.status(400).json({ success: false, message: 'Message is required' });
    const conversation = await ownConversation(req, res);
    if (!conversation) return;
    if (conversation.messages.length >= Conversation.MAX_MESSAGES) {
        return res.status(409).json({ success: false, message: 'This conversation is full. Please start a new one.' });
    }
    const history = conversation.messages.slice(-CONTEXT_MESSAGES).map((m) => ({ role: m.role, content: decryptText(m.content) }));

    // Save the user's message even if the AI call fails, so nothing they wrote is lost
    conversation.messages.push({ role: 'user', content: encryptText(message), createdAt: new Date() });
    if (conversation.title === 'New conversation') conversation.title = titleFrom(message);
    conversation.lastMessageAt = new Date();
    await conversation.save();

    try {
        const reply = await generateReply(history, message);
        conversation.messages.push({ role: 'assistant', content: encryptText(reply), createdAt: new Date() });
        conversation.lastMessageAt = new Date();
        await conversation.save();
        const saved = conversation.messages.slice(-2).map(toMessage);
        res.status(201).json({ success: true, message: reply, data: { conversation: summary(conversation), messages: saved } });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message, data: { conversation: summary(conversation), userMessageSaved: true } });
    }
};

// PATCH /api/chatbot/conversations/:id   { title }
const renameConversation = async (req, res) => {
    const title = cleanMessage(req.body.title).slice(0, 80);
    if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
    const conversation = await ownConversation(req, res);
    if (!conversation) return;
    conversation.title = title;
    await conversation.save();
    res.json({ success: true, data: summary(conversation) });
};

// DELETE /api/chatbot/conversations/:id
const deleteConversation = async (req, res) => {
    const conversation = await ownConversation(req, res);
    if (!conversation) return;
    await conversation.deleteOne();
    res.json({ success: true, message: 'Conversation deleted' });
};

module.exports = {
    sendMessage,
    generateReply,
    listConversations,
    createConversation,
    getConversation,
    sendConversationMessage,
    renameConversation,
    deleteConversation,
};
