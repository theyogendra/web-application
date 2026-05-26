const jwt = require('jsonwebtoken');
const env = require('../config/env');

function decodeUserFromToken(token) {
  // jwt.verify throws on bad signature / expired / malformed. We catch it
  // and return null so the caller decides whether to 401 or just skip.
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (!payload || !payload.sub) return null;
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role || null,
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
      is_superuser: !!payload.is_superuser
    };
  } catch (err) {
    return null;
  }
}

// Find a JWT in either the Authorization header or an HttpOnly cookie.
function tokenFromRequest(req) {
  const authHeader = req.headers && req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return { token: authHeader.split(' ')[1], source: 'bearer' };
  }
  if (req.cookies && req.cookies.token) {
    return { token: req.cookies.token, source: 'cookie' };
  }
  return { token: null, source: null };
}

// authenticate -- hard 401 when the token is missing or invalid.
const authenticate = async (req, res, next) => {
  const { token } = tokenFromRequest(req);
  if (!token) return res.status(401).json({ detail: 'Missing or invalid token' });

  const user = decodeUserFromToken(token);
  if (!user) return res.status(401).json({ detail: 'Invalid or expired token' });

  req.user = user;
  next();
};

// optionalAuth -- verify the token when present, otherwise just continue.
// Lets read-only routes work without a session while still letting authed
// requests be attributed in audit logs.
const optionalAuth = (req, res, next) => {
  const { token, source } = tokenFromRequest(req);
  if (token) {
    const user = decodeUserFromToken(token);
    if (user) {
      req.user = user;
      req.authSource = source;  // 'bearer' or 'cookie' — used by CSRF middleware
    }
  }
  next();
};

// requirePermission -- enforces a permission string. Always 401 on
// unauthenticated requests; Admin / is_superuser bypass.
const requirePermission = (permissionName) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ detail: 'Authentication required' });
    }

    if (req.user.is_superuser) return next();
    if (!permissionName) return next();
    if (Array.isArray(req.user.permissions) && req.user.permissions.includes(permissionName)) {
      return next();
    }

    return res.status(403).json({
      detail: 'You do not have permission for this action',
      required: permissionName
    });
  };
};

// requireModuleAccess(module, level) -- enforces per-user module access
// (Employee role uses user_module_access). Admin / Manager / is_superuser
// bypass. Level is 'view' or 'edit'; edit also satisfies view.
function requireModuleAccess(module, level = 'view') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ detail: 'Authentication required' });
    }
    if (req.user.is_superuser) return next();
    const roleName = req.user.role || '';
    if (roleName === 'Admin' || roleName === 'Manager') return next();

    const access = req.user.module_access || {};
    const granted = access[module];                  // 'edit' | 'view' | undefined
    const ok = level === 'view'
      ? granted === 'view' || granted === 'edit'
      : granted === 'edit';
    if (ok) return next();

    return res.status(403).json({
      detail: `You do not have ${level} access to ${module}`,
      module, required: level
    });
  };
}

module.exports = {
  authenticate, optionalAuth, requirePermission, requireModuleAccess, decodeUserFromToken
};
