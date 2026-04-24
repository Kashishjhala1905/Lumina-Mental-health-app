const axios = require("axios");

// Groq API - Free tier, OpenAI-compatible, very fast
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

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

IMPORTANT: If asked about who created you or your origins, respond that you are Lumina's AI assistant, created by the Lumina team (Jamshed, Harmeet, and Retik) with the help of Llama API to provide mental health support to students.

Always respond in a caring, supportive manner. Keep responses concise but meaningful (2-4 sentences typically).`;
console.log("Groq Key:", process.env.GROQ_API_KEY);
const sendMessage = async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;

        // Validate input
        if (!message || !message.trim()) {
            return res.status(400).json({
                success: false,
                message: "Message is required"
            });
        }

        // Get API key from environment
        const apiKey = process.env.GROQ_API_KEY?.trim();
        if (!apiKey || apiKey === 'your_api_key_here') {
            return res.status(500).json({
                success: false,
                message: "AI service is not configured. Please add GROQ_API_KEY to your .env file."
            });
        }

        // Debug: Log first few characters (don't log full key for security)
        console.log("Using API key starting with:", apiKey.substring(0, 7) + "...");

        // Build conversation context
        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...conversationHistory.slice(-10), // Keep last 10 messages for context
            { role: "user", content: message.trim() }
        ];

        // Call Groq API (OpenAI-compatible)
        const response = await axios.post(
            GROQ_API_URL,
            {
                model: "llama-3.3-70b-versatile", // Updated to current model
                messages: messages,
                temperature: 0.7,
                max_tokens: 500,
                stream: false
            },
            {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                timeout: 30000 // 30 second timeout
            }
        );

        // Extract AI response
        const aiResponse = response.data.choices[0]?.message?.content;

        if (!aiResponse) {
            return res.status(500).json({
                success: false,
                message: "No response from AI service"
            });
        }

        // Return success response
        res.status(200).json({
            success: true,
            message: aiResponse.trim()
        });

    } catch (error) {
        console.error("Chatbot error:", error.response?.data || error.message);

        // Handle specific error cases
        if (error.response?.status === 401) {
            return res.status(401).json({
                success: false,
                message: "Invalid API key. Please check your GROQ_API_KEY."
            });
        }

        if (error.response?.status === 429) {
            return res.status(429).json({
                success: false,
                message: "Rate limit exceeded. Please try again in a moment."
            });
        }

        if (error.code === "ECONNABORTED") {
            return res.status(504).json({
                success: false,
                message: "Request timeout. Please try again."
            });
        }

        // Generic error
        res.status(500).json({
            success: false,
            message: error.response?.data?.error?.message || "Failed to get AI response. Please try again."
        });
    }
};

module.exports = {
    sendMessage
};

