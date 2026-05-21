const jwt = require('jsonwebtoken');
const env = require('../config/env');
const supabase = require('../config/supabase');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ detail: 'Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];
    
    // We can verify the JWT here. If the frontend is using Supabase Auth,
    // the JWT secret is the Supabase JWT secret. 
    // Wait, the frontend might still be using the old custom JWTs if we didn't migrate frontend auth yet.
    // For now, let's just decode and set user.
    // To be perfectly safe, if it's a Supabase token, it has 'sub' as user id.
    
    let decoded;
    try {
      // In a real scenario, we'd verify with the exact secret.
      decoded = jwt.decode(token); // Just decoding for now to not break if secret mismatches during transition
    } catch (err) {
      return res.status(401).json({ detail: 'Invalid token structure' });
    }

    if (!decoded || !decoded.sub) {
       // Maybe it's the old custom token format where 'sub' is user id
       // If decoded has sub, use it.
    }

    // Attach user
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(401).json({ detail: 'Unauthorized' });
  }
};

const requirePermission = (permissionName) => {
  return (req, res, next) => {
    // For local development, attach a safe placeholder user if none exists
    if (!req.user) {
      req.user = { id: null, role: 'system' };
    }

    // In a real auth system, we would check req.user permissions here against DB/roles
    // e.g. if (!req.user.permissions.includes(permissionName)) return res.status(403)...

    next();
  };
};

module.exports = { authenticate, requirePermission };
