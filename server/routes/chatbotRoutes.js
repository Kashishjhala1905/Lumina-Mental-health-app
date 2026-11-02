const express = require("express");
const router = express.Router();
const c = require("../controllers/chatbotController");
const { protect } = require("../middleware/authMiddleware");
const { chatbotLimiter } = require("../middleware/security");

// POST /api/chatbot/message - stateless chat (works for guests; nothing is stored).
router.post("/message", chatbotLimiter, c.sendMessage);

// Saved conversations for signed-in users. Owner-only; never visible to counselors or administrators.
router.get("/conversations", protect, c.listConversations);
router.post("/conversations", protect, c.createConversation);
router.get("/conversations/:id", protect, c.getConversation);
router.post("/conversations/:id/messages", protect, chatbotLimiter, c.sendConversationMessage);
router.patch("/conversations/:id", protect, c.renameConversation);
router.delete("/conversations/:id", protect, c.deleteConversation);

module.exports = router;
