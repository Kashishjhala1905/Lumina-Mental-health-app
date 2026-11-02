// ownershipCheck middleware – ensures a resource belongs to the authenticated user (or allows counselors/admins where applicable)
module.exports = function(resourceUserIdField = 'userId') {
  return function(req, res, next) {
    try {
      const resourceUserId = req[resourceUserIdField]; // expect controller to set req.resourceUserId before calling
      if (!resourceUserId) {
        return res.status(400).json({ error: 'Resource user ID not provided' });
      }
      // If caller is the owner, allow
      if (req.user && req.user.id && req.user.id === String(resourceUserId)) {
        return next();
      }
      // Counselors and admins can bypass ownership for assigned cases (handled elsewhere)
      if (['counselor', 'admin'].includes(req.user && req.user.role)) {
        return next();
      }
      return res.status(403).json({ error: 'Forbidden: you do not own this resource' });
    } catch (err) {
      next(err);
    }
  };
};
