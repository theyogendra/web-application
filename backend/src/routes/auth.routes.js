const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");
const env = require("../config/env");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { authenticate } = require("../middleware/auth.middleware");
const { createAuditLog } = require("../services/audit.service");

// Cookie security is decided per-request from app.locals.secureCookies, which
// server.js sets based on the actual HTTPS state (ENABLE_HTTPS=true OR
// NODE_ENV=production). That way the Secure flag is always honest: cookies
// won't be issued without TLS, and won't be silently rejected by the browser.
const TOKEN_TTL_MS = 8 * 24 * 60 * 60 * 1000; // 8 days, matches JWT expiry

function cookieBase(req) {
  const secure = !!(req.app && req.app.locals && req.app.locals.secureCookies);
  return {
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure,
  };
}

function setAuthCookies(req, res, token) {
  const base = cookieBase(req);
  // HttpOnly token cookie — JS can't read it, mitigates XSS theft.
  res.cookie("token", token, { ...base, httpOnly: true, maxAge: TOKEN_TTL_MS });
  // Non-HttpOnly CSRF cookie — frontend reads + echoes in X-CSRF-Token.
  const csrf = crypto.randomBytes(24).toString("hex");
  res.cookie("csrf", csrf, { ...base, httpOnly: false, maxAge: TOKEN_TTL_MS });
}

function clearAuthCookies(req, res) {
  const base = cookieBase(req);
  res.clearCookie("token", { ...base, httpOnly: true });
  res.clearCookie("csrf", { ...base, httpOnly: false });
}

// Login rate-limit: 50 attempts per 15 minutes per IP. Blunts credential
// stuffing / brute-force attacks without making real users feel anything.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    detail: "Too many login attempts. Please wait a few minutes and try again.",
  },
});

// Login historically accepted multipart form-data (legacy OAuth2 password
// flow). multer().none() keeps that working for the new login page too.
const multer = require("multer");
const upload = multer();

// Per-user module access map { module: 'view' | 'edit', ... }.
async function loadModuleAccess(userId) {
  if (!userId) return {};
  const { data, error } = await supabase
    .from("user_module_access")
    .select("module, access_level")
    .eq("user_id", userId);
  if (error) {
    console.error("Failed to load module access:", error.message);
    return {};
  }
  const out = {};
  for (const row of data || []) out[row.module] = row.access_level;
  return out;
}

// Public shape of a user — never leak the password / hash.
function publicUser(user, role, moduleAccess) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.name,
    phone: user.phone || null,
    avatar_url: user.avatar_url || null,
    is_active: user.is_active !== false,
    is_superuser: !!user.is_superuser,
    role: role
      ? { id: role.id, name: role.name, description: role.description }
      : null,
    permissions:
      role && Array.isArray(role.permissions) ? role.permissions : [],
    module_access: moduleAccess || {},
    last_login_at: user.last_login_at || null,
    created_at: user.created_at,
  };
}

router.post("/login", loginLimiter, upload.none(), async (req, res, next) => {
  try {
    // Accept either "username" (legacy) or "email" as the identifier.
    const username = req.body.username || req.body.email;
    const password = req.body.password;

    if (!username || !password) {
      return res
        .status(400)
        .json({ detail: "Email and password are required" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*, roles(id, name, description, permissions)")
      .eq("email", username)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ detail: "Incorrect email or password" });
    }

    if (user.is_active === false) {
      return res.status(403).json({ detail: "This account has been disabled" });
    }

    // Password check.
    //   * If password_hash is set -> use bcrypt (the modern path).
    //   * Otherwise -> fall back to legacy plaintext compare AND lazily
    //     migrate that row to bcrypt on success.
    let ok = false;
    if (user.password_hash) {
      try {
        ok = await bcrypt.compare(password, user.password_hash);
      } catch {
        ok = false;
      }
    } else if (user.password) {
      ok = user.password === password;
      if (ok) {
        try {
          const hash = await bcrypt.hash(password, 10);
          await supabase
            .from("users")
            .update({ password_hash: hash, password: hash })
            .eq("id", user.id);
        } catch (e) {
          console.error(
            "Lazy password-hash migration failed (non-fatal):",
            e.message,
          );
        }
      }
    }
    if (!ok) {
      return res.status(401).json({ detail: "Incorrect email or password" });
    }

    const role = user.roles || null;
    const moduleAccess = await loadModuleAccess(user.id);

    const access_token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: role ? role.name : null,
        permissions:
          role && Array.isArray(role.permissions) ? role.permissions : [],
        module_access: moduleAccess,
        is_superuser: !!user.is_superuser,
      },
      env.JWT_SECRET,
      { expiresIn: "8d" },
    );

    // Best-effort: record the login on the user row.
    try {
      await supabase
        .from("users")
        .update({
          last_login_at: new Date().toISOString(),
          last_login_ip: req.ip || null,
        })
        .eq("id", user.id);
    } catch (e) {
      console.error("Failed to update last_login_at:", e.message);
    }

    await createAuditLog({
      userId: user.id,
      userName: user.email,
      action: "login",
      module: "Auth",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      details: { role: role ? role.name : null },
    });

    // Set HttpOnly token + CSRF cookies for the cookie-auth path. The
    // access_token is also returned in the body so the legacy Bearer-header
    // path keeps working.
    setAuthCookies(req, res, access_token);

    res.json({
      access_token,
      refresh_token: "dummy_refresh_token",
      token_type: "bearer",
      user: publicUser(user, role, moduleAccess),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("*, roles(id, name, description, permissions)")
      .eq("id", req.user.id)
      .maybeSingle();

    if (error || !user) {
      return res.status(404).json({ detail: "User not found" });
    }

    const moduleAccess = await loadModuleAccess(user.id);
    res.json(publicUser(user, user.roles || null, moduleAccess));
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      // Use verify so we don't audit forged-token "logouts" as real users.
      let decoded = null;
      try {
        decoded = jwt.verify(authHeader.split(" ")[1], env.JWT_SECRET);
      } catch {}
      if (decoded && decoded.sub) {
        await createAuditLog({
          userId: decoded.sub,
          userName: decoded.email,
          action: "logout",
          module: "Auth",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
      }
    }
  } catch (err) {
    console.error("Logout audit log failed:", err.message);
  }
  clearAuthCookies(req, res);
  res.json({ message: "Logged out successfully" });
});

module.exports = router;
