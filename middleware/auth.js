const jwt = require('jsonwebtoken');

// Verify JWT and attach user + tenant info to req
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    // decoded contains: id, tenant_id, username, name, role
    req.user = decoded;
    req.tenantId = decoded.tenant_id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Role-based authorization
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
  }
  next();
};

module.exports = { auth, authorize };
