// Community – posts, comments and replies with per-item identity choice.
// Privacy is enforced HERE (serialisation), not in the browser: public responses never contain the
// author's account id, email or – for anonymous items – name. likedBy arrays are never exposed.
const mongoose = require('mongoose');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Reply = require('../models/Reply');
const { checkContent } = require('../services/contentSafety');
const { auditLog } = require('../services/auditService');
const { dateRange } = require('../utils/dateRange');

const AUTO_HIDE_REPORTS = 3; // distinct reporters before a post is hidden pending review
const isId = (v) => mongoose.isValidObjectId(v);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const sameId = (a, b) => !!a && !!b && String(a._id || a) === String(b._id || b);

const getSort = (feed = 'latest') => {
  if (feed === 'most-liked') return { likesCount: -1, createdAt: -1 };
  if (feed === 'trending') return { likesCount: -1, commentsCount: -1, createdAt: -1 };
  return { createdAt: -1 };
};

/** Public author block. `user` may be a populated doc or an id; never echoed for anonymous items. */
function authorOf(user, anonymous) {
  if (anonymous) return { name: 'Anonymous User', initial: 'A', anonymous: true };
  const name = (user && typeof user === 'object' && user.name) ? user.name : 'Lumina member';
  return { name, initial: name.charAt(0).toUpperCase(), anonymous: false };
}

function serializeReply(r, viewer) {
  return { _id: r._id, content: r.content, author: authorOf(r.user, r.isAnonymous), isMine: sameId(r.user, viewer), createdAt: r.createdAt };
}

function serializeComment(c, viewer) {
  return {
    _id: c._id,
    content: c.content,
    author: authorOf(c.user, c.isAnonymous),
    isMine: sameId(c.user, viewer),
    createdAt: c.createdAt,
    replies: (c.replies || []).filter((r) => r && r.content).map((r) => serializeReply(r, viewer)),
  };
}

function serializePost(p, viewer, comments) {
  // Posts created before the identity choice existed have no recorded choice: shown anonymously (privacy first)
  const anonymous = p.identity !== 'public';
  return {
    _id: p._id,
    title: p.title || '',
    content: p.content,
    category: p.category || 'General',
    identity: anonymous ? 'anonymous' : 'public',
    author: authorOf(p.user, anonymous),
    isMine: sameId(p.user, viewer),
    likedByMe: !!viewer && (p.likedBy || []).some((id) => sameId(id, viewer)),
    likesCount: p.likesCount || 0,
    commentsCount: p.commentsCount || 0,
    createdAt: p.createdAt,
    editedAt: p.editedAt || null,
    ...(comments ? { comments } : {}),
  };
}

const withAuthors = (query) => query.populate('user', 'name'); // name only; anonymity applied in serialisers

async function commentsFor(postIds, viewer) {
  const comments = await withAuthors(Comment.find({ post: { $in: postIds } }))
    .populate({ path: 'replies', populate: { path: 'user', select: 'name' } })
    .sort({ createdAt: 1 })
    .lean();
  const byPost = {};
  for (const c of comments) (byPost[String(c.post)] ||= []).push(serializeComment(c, viewer));
  return byPost;
}

// GET /api/community/posts?category=&feed=&page=&limit=
const getPosts = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const filter = { status: { $in: ['published', null] } }; // legacy posts have no status
  if (Post.CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
  const [total, posts] = await Promise.all([
    Post.countDocuments(filter),
    withAuthors(Post.find(filter).sort(getSort(req.query.feed)).skip((page - 1) * limit).limit(limit)).lean(),
  ]);
  const comments = await commentsFor(posts.map((p) => p._id), req.user);
  res.json({
    success: true,
    categories: Post.CATEGORIES,
    data: posts.map((p) => serializePost(p, req.user, comments[String(p._id)] || [])),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
};

// GET /api/community/posts/mine?page=   – own posts incl. hidden/removed, with moderation status
const getMyPosts = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const filter = { user: req.user._id };
  const range = dateRange(req.query);
  if (range) filter.createdAt = range;
  const [total, posts] = await Promise.all([
    Post.countDocuments(filter),
    withAuthors(Post.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)).lean(),
  ]);
  res.json({
    success: true,
    data: posts.map((p) => ({ ...serializePost(p, req.user), status: p.status || 'published', moderationNote: p.status === 'removed' ? p.moderationNote || '' : undefined })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
};

// GET /api/community/posts/:id
const getPost = async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid post id' });
  const post = await withAuthors(Post.findById(req.params.id)).lean();
  const visible = post && (['published', undefined, null].includes(post.status) || sameId(post.user, req.user));
  if (!visible) return res.status(404).json({ success: false, message: 'Post not found' });
  const comments = await commentsFor([post._id], req.user);
  res.json({ success: true, data: { ...serializePost(post, req.user, comments[String(post._id)] || []), status: post.status || 'published' } });
};

function readPostInput(body, { partial = false } = {}) {
  const errors = {};
  const out = {};
  if (!partial || body.title !== undefined) {
    out.title = str(body.title, 120);
    if (!out.title) errors.title = 'Please add a short title';
  }
  if (!partial || body.content !== undefined) {
    out.content = str(body.content, 2000);
    if (!out.content) errors.content = 'Post content is required';
    else if (out.content.length > 1200) errors.content = 'Posts must be under 1200 characters';
  }
  if (!partial || body.category !== undefined) {
    out.category = Post.CATEGORIES.includes(body.category) ? body.category : 'General';
  }
  if (!partial || body.identity !== undefined) {
    if (!['public', 'anonymous'].includes(body.identity)) errors.identity = 'Please choose how your identity should appear';
    else out.identity = body.identity;
  }
  return { out, errors };
}

// POST /api/community/posts   { title, content, category, identity: 'public'|'anonymous' }
const createPost = async (req, res) => {
  const { out, errors } = readPostInput(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
  const safety = checkContent(`${out.title}\n${out.content}`);
  if (!safety.ok) return res.status(400).json({ success: false, message: safety.message });

  const post = await Post.create({ ...out, user: req.user._id, status: 'published', flaggedForReview: safety.crisis });
  const populated = await withAuthors(Post.findById(post._id)).lean();
  res.status(201).json({
    success: true,
    message: 'Post published',
    supportPrompt: safety.crisis, // client shows helplines to the author
    data: serializePost(populated, req.user, []),
  });
};

// PATCH /api/community/posts/:id   (owner only)
const updatePost = async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid post id' });
  const post = await Post.findById(req.params.id);
  if (!post || !sameId(post.user, req.user)) return res.status(post ? 403 : 404).json({ success: false, message: post ? 'You can edit only your own posts' : 'Post not found' });
  if (post.status === 'removed') return res.status(409).json({ success: false, message: 'This post was removed by a moderator and cannot be edited' });
  const { out, errors } = readPostInput(req.body, { partial: true });
  if (Object.keys(errors).length) return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
  const safety = checkContent(`${out.title ?? post.title ?? ''}\n${out.content ?? post.content}`);
  if (!safety.ok) return res.status(400).json({ success: false, message: safety.message });
  Object.assign(post, out, { editedAt: new Date() });
  if (safety.crisis) post.flaggedForReview = true;
  await post.save();
  const populated = await withAuthors(Post.findById(post._id)).lean();
  res.json({ success: true, message: 'Post updated', supportPrompt: safety.crisis, data: serializePost(populated, req.user) });
};

// DELETE /api/community/posts/:id   (owner or admin)
const deletePost = async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid post id' });
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
  const isOwner = sameId(post.user, req.user);
  if (!isOwner && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'You can delete only your own posts' });
  const comments = await Comment.find({ post: post._id }).select('_id').lean();
  await Reply.deleteMany({ comment: { $in: comments.map((c) => c._id) } });
  await Comment.deleteMany({ post: post._id });
  await post.deleteOne();
  if (!isOwner) await auditLog({ action: 'COMMUNITY_POST_DELETED', actor: req.user, entityType: 'Post', entityId: post._id });
  res.json({ success: true, message: 'Post deleted' });
};

// PUT /api/community/posts/:id/like
const toggleLikePost = async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid post id' });
  const post = await Post.findOne({ _id: req.params.id, status: { $in: ['published', null] } });
  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
  const alreadyLiked = post.likedBy.some((id) => sameId(id, req.user));
  if (alreadyLiked) { post.likedBy.pull(req.user._id); post.likesCount = Math.max(post.likesCount - 1, 0); }
  else { post.likedBy.push(req.user._id); post.likesCount += 1; }
  await post.save();
  req.app.get('io')?.emit('postLikeUpdated', { postId: post.id, likesCount: post.likesCount });
  res.json({ success: true, likesCount: post.likesCount, liked: !alreadyLiked });
};

// POST /api/community/posts/:id/comments   { content, anonymous? }
const addComment = async (req, res) => {
  const content = str(req.body.content, 1000);
  if (!content) return res.status(400).json({ success: false, message: 'Comment is required' });
  const safety = checkContent(content);
  if (!safety.ok) return res.status(400).json({ success: false, message: safety.message });
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid post id' });
  const post = await Post.findOne({ _id: req.params.id, status: { $in: ['published', null] } });
  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
  const comment = await Comment.create({ post: post._id, user: req.user._id, content, isAnonymous: req.body.anonymous === true });
  post.commentsCount += 1;
  if (safety.crisis) post.flaggedForReview = true;
  await post.save();
  const populated = await withAuthors(Comment.findById(comment._id)).lean();
  res.status(201).json({ success: true, supportPrompt: safety.crisis, data: serializeComment({ ...populated, replies: [] }, req.user) });
};

// POST /api/community/comments/:commentId/replies   { content, anonymous? }
const addReply = async (req, res) => {
  const content = str(req.body.content, 1000);
  if (!content) return res.status(400).json({ success: false, message: 'Reply is required' });
  const safety = checkContent(content);
  if (!safety.ok) return res.status(400).json({ success: false, message: safety.message });
  if (!isId(req.params.commentId)) return res.status(400).json({ success: false, message: 'Invalid comment id' });
  const comment = await Comment.findById(req.params.commentId);
  if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });
  const post = await Post.findOne({ _id: comment.post, status: { $in: ['published', null] } });
  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
  const reply = await Reply.create({ comment: comment._id, user: req.user._id, content, isAnonymous: req.body.anonymous === true });
  comment.replies.push(reply._id);
  await comment.save();
  await Post.updateOne({ _id: comment.post }, { $inc: { commentsCount: 1 }, ...(safety.crisis ? { $set: { flaggedForReview: true } } : {}) });
  const populated = await withAuthors(Reply.findById(reply._id)).lean();
  res.status(201).json({ success: true, supportPrompt: safety.crisis, data: serializeReply(populated, req.user) });
};

// DELETE /api/community/comments/:commentId   (owner or admin)
const deleteComment = async (req, res) => {
  if (!isId(req.params.commentId)) return res.status(400).json({ success: false, message: 'Invalid comment id' });
  const comment = await Comment.findById(req.params.commentId);
  if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });
  if (!sameId(comment.user, req.user) && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'You can delete only your own comments' });
  const replies = await Reply.countDocuments({ comment: comment._id });
  await Reply.deleteMany({ comment: comment._id });
  await Comment.deleteOne({ _id: comment._id });
  await Post.updateOne({ _id: comment.post }, { $inc: { commentsCount: -(1 + replies) } });
  res.json({ success: true, message: 'Comment deleted' });
};

// POST /api/community/posts/:id/report   { reason }
const reportContent = async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid post id' });
  const reason = Post.REPORT_REASONS.includes(req.body.reason) ? req.body.reason : 'Other';
  const post = await Post.findById(req.params.id);
  if (!post || post.status === 'removed') return res.status(404).json({ success: false, message: 'Post not found' });
  if (sameId(post.user, req.user)) return res.status(400).json({ success: false, message: 'You cannot report your own post' });
  if (post.reports.some((r) => sameId(r.user, req.user))) {
    return res.json({ success: true, message: 'You have already reported this post. A moderator will review it.' });
  }
  post.reports.push({ user: req.user._id, reason });
  post.flaggedForReview = true;
  const distinct = new Set(post.reports.map((r) => String(r.user))).size;
  if (distinct >= AUTO_HIDE_REPORTS && post.status === 'published') post.status = 'hidden';
  await post.save();
  res.json({ success: true, message: 'Report submitted. Thank you for helping keep the community safe.' });
};

// ---------------- Moderation (admin) ----------------

// GET /api/admin/community/posts?filter=flagged|reported|hidden|removed|all&page=
const listForModeration = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = 20;
  const f = req.query.filter || 'flagged';
  const filter = f === 'reported' ? { 'reports.0': { $exists: true } }
    : f === 'hidden' ? { status: 'hidden' }
      : f === 'removed' ? { status: 'removed' }
        : f === 'all' ? {}
          : { flaggedForReview: true, status: { $ne: 'removed' } };
  const [total, posts] = await Promise.all([
    Post.countDocuments(filter),
    withAuthors(Post.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit)).lean(),
  ]);
  res.json({
    success: true,
    data: posts.map((p) => ({
      ...serializePost(p, null),
      // Moderators see content and reports; anonymous authors stay anonymous here too
      status: p.status || 'published',
      flaggedForReview: !!p.flaggedForReview,
      reports: (p.reports || []).map((r) => ({ reason: r.reason, createdAt: r.createdAt })),
      moderationNote: p.moderationNote || '',
      moderatedAt: p.moderatedAt,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
};

// PATCH /api/admin/community/posts/:id   { status: 'published'|'hidden'|'removed', note? }
const moderatePost = async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid post id' });
  if (!['published', 'hidden', 'removed'].includes(req.body.status)) return res.status(400).json({ success: false, message: 'Status must be published, hidden or removed' });
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
  const from = post.status || 'published';
  post.status = req.body.status;
  post.flaggedForReview = false;
  post.moderationNote = str(req.body.note, 300) || undefined;
  post.moderatedAt = new Date();
  await post.save();
  await auditLog({ action: 'COMMUNITY_POST_MODERATED', actor: req.user, entityType: 'Post', entityId: post._id, metadata: { from, to: post.status } });
  res.json({ success: true, message: `Post ${post.status}` });
};

module.exports = {
  getPosts,
  getMyPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  toggleLikePost,
  addComment,
  addReply,
  deleteComment,
  reportContent,
  listForModeration,
  moderatePost,
};
