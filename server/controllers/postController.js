const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Reply = require('../models/Reply');
const Filter = require('bad-words');
const filter = new Filter();

// @desc    Get all posts (pagination, sort)
// @route   GET /api/community/posts
// @access  Public
const getPosts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, sort = '-createdAt' } = req.query;
  const skip = (page - 1) * limit;
  const posts = await Post.find()
    .sort(sort)
    .skip(skip)
    .limit(Number(limit))
    .populate('user', 'name')
    .lean();
  const total = await Post.countDocuments();
  res.json({ success: true, total, page: Number(page), limit: Number(limit), data: posts });
});

// @desc    Create a new post
// @route   POST /api/community/posts
// @access  Private
const createPost = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const { title, content } = req.body;
  const post = await Post.create({
    user: req.user.id,
    title,
    content,
  });
  res.status(201).json({ success: true, data: post });
});

// @desc    Like a post (toggle)
// @route   POST /api/community/posts/:id/like
// @access  Private
const toggleLike = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) {
    return res.status(404).json({ success: false, message: 'Post not found' });
  }
  const userId = req.user.id;
  const likedIndex = post.likedBy.findIndex((id) => id.toString() === userId);
  if (likedIndex > -1) {
    // unlike
    post.likedBy.splice(likedIndex, 1);
    post.likesCount = Math.max(post.likesCount - 1, 0);
  } else {
    // like
    post.likedBy.push(userId);
    post.likesCount += 1;
    // Emit real‑time update via socket.io if available
    const io = req.app.get('io');
    if (io) {
      io.emit('postLiked', { postId: post.id, likesCount: post.likesCount });
    }
  }
  await post.save();
  res.json({ success: true, likesCount: post.likesCount });
});

// @desc    Add a comment to a post
// @route   POST /api/community/posts/:id/comments
// @access  Private
const addComment = asyncHandler(async (req, res) => {
  const { content } = req.body;
  if (filter.isProfane(content)) {
    return res.status(400).json({ success: false, message: 'Profanity is not allowed' });
  }
  const post = await Post.findById(req.params.id);
  if (!post) {
    return res.status(404).json({ success: false, message: 'Post not found' });
  }
  const comment = await Comment.create({
    post: post.id,
    user: req.user.id,
    content,
  });
  post.commentsCount += 1;
  await post.save();
  res.status(201).json({ success: true, data: comment });
});

// @desc    Add a reply to a comment
// @route   POST /api/community/comments/:id/replies
// @access  Private
const addReply = asyncHandler(async (req, res) => {
  const { content } = req.body;
  if (filter.isProfane(content)) {
    return res.status(400).json({ success: false, message: 'Profanity is not allowed' });
  }
  const comment = await Comment.findById(req.params.id);
  if (!comment) {
    return res.status(404).json({ success: false, message: 'Comment not found' });
  }
  const reply = await Reply.create({
    comment: comment.id,
    user: req.user.id,
    content,
  });
  res.status(201).json({ success: true, data: reply });
});

module.exports = {
  getPosts,
  createPost,
  toggleLike,
  addComment,
  addReply,
};
