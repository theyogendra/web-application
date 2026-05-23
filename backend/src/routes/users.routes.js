const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const { optionalAuth } = require('../middleware/auth.middleware');
const { createAuditLog } = require('../services/audit.service');
const { sanitizeSearch } = require('../utils/escape');

router.use(optionalAuth);

// Public-safe projection (never returns password / password_hash).
const SAFE_SELECT =
  'id, name, email, phone, avatar_url, is_active, is_superuser, last_login_at, created_at, role_id, roles(id, name, description, permissions)';

// GET /users  -- list users
router.get('/', async (req, res, next) => {
  try {
    let q = supabase.from('users').select(SAFE_SELECT).order('created_at', { ascending: false });
    const search = sanitizeSearch(req.query.search);
    if (search) q = q.ilike('name', `%${search}%`);
    if (req.query.role_id) q = q.eq('role_id', req.query.role_id);
    if (req.query.is_active !== undefined) q = q.eq('is_active', req.query.is_active === 'true');

    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('users').select(SAFE_SELECT).eq('id', req.params.id).maybeSingle();
    if (error || !data) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /users  -- create
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, phone, role_id, is_active, is_superuser } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email and password are required' });
    }

    // Hash the password — the legacy `password` column has NOT NULL, so we
    // store the same bcrypt hash in both columns until that constraint is
    // dropped in a future migration.
    const hash = await bcrypt.hash(password, 10);
    const insert = {
      name, email,
      password: hash,
      password_hash: hash,
      phone: phone || null,
      role_id: role_id || null,
      is_active: is_active !== false,
      is_superuser: !!is_superuser,
      created_by: req.user ? req.user.id : null
    };

    const { data, error } = await supabase.from('users').insert([insert]).select(SAFE_SELECT).single();
    if (error) throw error;

    await createAuditLog({
      req, action: 'user_created', module: 'Settings',
      entityType: 'user', entityId: data.id, newData: data
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// PUT /users/:id
router.put('/:id', async (req, res, next) => {
  try {
    const allowed = ['name', 'email', 'phone', 'avatar_url', 'role_id', 'is_active', 'is_superuser'];
    const patch = { updated_at: new Date().toISOString() };
    for (const f of allowed) if (req.body[f] !== undefined) patch[f] = req.body[f];

    // Optional password change -- always hashed.
    if (req.body.password) {
      const hash = await bcrypt.hash(req.body.password, 10);
      patch.password = hash;
      patch.password_hash = hash;
    }

    const { data, error } = await supabase.from('users').update(patch).eq('id', req.params.id).select(SAFE_SELECT).single();
    if (error || !data) return res.status(404).json({ success: false, message: 'User not found' });

    await createAuditLog({
      req, action: 'user_updated', module: 'Settings',
      entityType: 'user', entityId: data.id, newData: data
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
