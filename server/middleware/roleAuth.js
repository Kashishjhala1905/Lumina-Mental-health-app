// roleAuth middleware – restricts access to given roles
module.exports = function(requiredRoles) {
  return function(req, res, next) {
    try {
      const userRole = req.user && req.user.role;
      if (!userRole) {
        return res.status(401).json({ error: 'Unauthenticated' });
      }
      if (!requiredRoles.includes(userRole)) {
        return res.status(403).json({ error: 'Forbidden: insufficient role' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};
