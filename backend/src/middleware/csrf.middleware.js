// Double-submit-cookie CSRF protection.
//
// On login we set a non-HttpOnly `csrf` cookie containing a random hex
// string. The frontend reads it (cookies are same-origin-readable from JS)
// and echoes it back on every state-changing request via X-CSRF-Token.
// Cross-origin attacker JS can NOT read the cookie value (same-origin
// policy), so it can not forge the header to match.
//
// We only enforce CSRF when:
//   1. The request method actually mutates state (POST/PUT/PATCH/DELETE)
//   2. Authentication came in via the cookie (not via Bearer)
//
// Bearer-token clients (curl, mobile, server-to-server) bypass CSRF because
// they don't carry cookies and aren't subject to CSRF in the first place.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = [
  /^\/api(?:\/v1)?\/auth\/login$/,
  /^\/api(?:\/v1)?\/auth\/logout$/
];

function isExempt(path) {
  for (const re of EXEMPT_PATHS) if (re.test(path)) return true;
  return false;
}

function csrfMiddleware(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (isExempt(req.path)) return next();

  // No cookie session -> Bearer/anonymous -> CSRF doesn't apply.
  if (!req.cookies || !req.cookies.token) return next();

  const header = req.headers['x-csrf-token'];
  const cookie = req.cookies.csrf;

  if (!header || !cookie || header !== cookie) {
    return res.status(403).json({ detail: 'Invalid or missing CSRF token' });
  }
  next();
}

module.exports = { csrfMiddleware };
