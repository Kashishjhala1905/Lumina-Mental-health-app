# 🤖 AI Chatbot Setup Guide

## Overview
The chatbot now uses **Groq API** - a free, fast, and high-quality AI service that works exactly like OpenAI/Claude. It uses the model set in `GROQ_MODEL` (default `openai/gpt-oss-120b`; the original `llama-3.3-70b-versatile` has been retired by Groq).

## ✅ Why Groq?
- **100% Free** - Generous free tier, no credit card required
- **Super Fast** - GPU-accelerated responses (often < 1 second)
- **OpenAI-Compatible** - Same API structure as OpenAI
- **High Quality** - Configurable model via `GROQ_MODEL` (default openai/gpt-oss-120b)
- **No Rate Limits** - Generous free tier limits

## 🚀 Setup Instructions

### Step 1: Get Your Free Groq API Key

1. Go to [https://console.groq.com](https://console.groq.com)
2. Sign up for a free account (no credit card needed)
3. Navigate to **API Keys** section
4. Click **Create API Key**
5. Copy your API key (starts with `gsk_...`)

### Step 2: Add API Key to Environment Variables

1. Open `server/.env` file (create it if it doesn't exist)
2. Add the following line:
   ```
   GROQ_API_KEY=your_api_key_here
   ```
   Replace `your_api_key_here` with your actual API key from Step 1

3. Your `.env` file should look something like this:
   ```
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   GROQ_API_KEY=gsk_your_actual_api_key_here
   ```

### Step 3: Restart Your Server

The server needs to be restarted to load the new environment variable:

1. Stop the current server (Ctrl+C in the terminal)
2. Start it again:
   ```bash
   cd server
   npm run dev
   ```

## 🧪 Testing the Chatbot

1. Make sure both servers are running:
   - Backend: `http://localhost:5000`
   - Frontend: `http://localhost:5173`

2. Navigate to the chatbot page: `http://localhost:5173/chatbot`

3. Try sending a message like "I'm feeling anxious"

4. You should get a real AI response within 1-2 seconds!

## 🔧 Troubleshooting

### Error: "AI service is not configured"
- Make sure `GROQ_API_KEY` is in your `server/.env` file
- Restart the server after adding the key
- Check for typos in the environment variable name

### Error: "Invalid API key"
- Verify your API key is correct
- Make sure there are no extra spaces or quotes around the key
- Get a new API key from Groq console if needed

### Error: "Rate limit exceeded"
- Groq has generous limits, but if you hit them, wait a few minutes
- This is rare on the free tier

### Chatbot not responding
- Check browser console for errors (F12)
- Check server terminal for error messages
- Verify backend is running on port 5000
- Verify frontend can reach the backend (CORS is configured)

## 📝 API Endpoint

The chatbot uses:
- **Endpoint**: `POST /api/chatbot/message`
- **Request Body**:
  ```json
  {
    "message": "User's message here",
    "conversationHistory": [
      { "role": "user", "content": "Previous message" },
      { "role": "assistant", "content": "Previous response" }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "AI response here"
  }
  ```

## 🎯 Features

- ✅ Real AI conversations (not mock responses)
- ✅ Conversation context (remembers previous messages)
- ✅ Mental health-focused responses
- ✅ Error handling and user-friendly messages
- ✅ Loading states
- ✅ Quick suggestion buttons

## 🔒 Security Notes

- Never commit your `.env` file to git
- Keep your API key secret
- The `.env` file is already in `.gitignore`

## 📚 Additional Resources

- [Groq Documentation](https://console.groq.com/docs)
- [Groq Console](https://console.groq.com)
- [Llama 3.1 Model Info](https://llama.meta.com/llama3.1/)

---

**That's it!** Your chatbot is now powered by real AI. Enjoy! 🎉

