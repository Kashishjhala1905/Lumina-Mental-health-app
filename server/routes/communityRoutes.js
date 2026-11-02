const express = require('express');
const router = express.Router();
const c = require('../controllers/communityController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { communityPostLimiter, communityCommentLimiter } = require('../middleware/security');

// Reading is public; a valid session only adds "isMine"/"likedByMe" flags
router.get('/posts', optionalAuth, c.getPosts);
router.get('/posts/mine', protect, c.getMyPosts);
router.get('/posts/:id', optionalAuth, c.getPost);

router.post('/posts', protect, communityPostLimiter, c.createPost);
router.patch('/posts/:id', protect, c.updatePost);
router.delete('/posts/:id', protect, c.deletePost);
router.put('/posts/:id/like', protect, c.toggleLikePost);
router.post('/posts/:id/comments', protect, communityCommentLimiter, c.addComment);
router.post('/comments/:commentId/replies', protect, communityCommentLimiter, c.addReply);
router.delete('/comments/:commentId', protect, c.deleteComment);
router.post('/posts/:id/report', protect, c.reportContent);

module.exports = router;
