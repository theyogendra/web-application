const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const { authenticate, requirePermission } = require('../middleware/auth.middleware');
const { createAuditLog } = require('../services/audit.service');
const { sanitizeSearch } = require('../utils/escape');

router.use(authenticate);

// Public-safe projection (never returns password / password_hash).
const SAFE_SELECT =
  'id, name, email, phone, avatar_url, is_active, is_superuser, last_login_at, created_at, role_id, roles(id, name, description, permissions)';

const VALID_MODULES = new Set(['inventory', 'proposals', 'quotations', 'invoices', 'payments']);
const VALID_LEVELS  = new Set(['view', 'edit']);

// Replace a user's module_access with the supplied map { module: 'view'|'edit' }.
async function syncModuleAccess(userId, moduleAccess) {
  if (!moduleAccess || typeof moduleAccess !== 'object') return;
  const rows = [];
  for (const [module, level] of Object.entries(moduleAccess)) {
    if (!VALID_MODULES.has(module)) continue;
    if (!level) continue;                        // empty / null means "no row"
    if (!VALID_LEVELS.has(level)) continue;
    rows.push({ user_id: userId, module, access_level: level });
  }
  // Wipe + recreate keeps the table the canonical source.
  await supabase.from('user_module_access').delete().eq('user_id', userId);
  if (rows.length) {
    const { error } = await supabase.from('user_module_access').insert(rows);
    if (error) throw error;
  }
}

async function loadModuleAccess(userId) {
  const { data, error } = await supabase
    .from('user_module_access')
    .select('module, access_level')
    .eq('user_id', userId);
  if (error) return {};
  const out = {};
  for (const r of data || []) out[r.module] = r.access_level;
  return out;
}

async function withModuleAccess(user) {
  return { ...user, module_access: await loadModuleAccess(user.id) };
}

// GET /users  -- list users (with their module_access decorated)
router.get('/', requirePermission('users.read'), async (req, res, next) => {
  try {
    let q = supabase.from('users').select(SAFE_SELECT).order('created_at', { ascending: false });
    const search = sanitizeSearch(req.query.search);
    if (search) q = q.ilike('name', `%${search}%`);
    if (req.query.role_id) q = q.eq('role_id', req.query.role_id);
    if (req.query.is_active !== undefined) q = q.eq('is_active', req.query.is_active === 'true');

    const { data, error } = await q;
    if (error) throw error;
    const decorated = await Promise.all((data || []).map(withModuleAccess));
    res.json({ success: true, data: decorated });
  } catch (err) {
    next(err);
  }
});

// GET /users/:id
router.get('/:id', requirePermission('users.read'), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('users').select(SAFE_SELECT).eq('id', req.params.id).maybeSingle();
    if (error || !data) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: await withModuleAccess(data) });
  } catch (err) {
    next(err);
  }
});

// POST /users  -- Admin-only create
router.post('/', requirePermission('users.create'), async (req, res, next) => {
  try {
    const { name, email, password, phone, role_id, is_active, is_superuser, module_access } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email and password are required' });
    }

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

    if (module_access) await syncModuleAccess(data.id, module_access);

    await createAuditLog({
      req, action: 'user_created', module: 'Settings',
      entityType: 'user', entityId: data.id,
      newData: { ...data, module_access: module_access || {} }
    });

    res.status(201).json({ success: true, data: await withModuleAccess(data) });
  } catch (err) {
    next(err);
  }
});

// PUT /users/:id  -- Admin-only edit
router.put('/:id', requirePermission('users.update'), async (req, res, next) => {
  try {
    const allowed = ['name', 'email', 'phone', 'avatar_url', 'role_id', 'is_active', 'is_superuser'];
    const patch = { updated_at: new Date().toISOString() };
    for (const f of allowed) if (req.body[f] !== undefined) patch[f] = req.body[f];

    if (req.body.password) {
      const hash = await bcrypt.hash(req.body.password, 10);
      patch.password = hash;
      patch.password_hash = hash;
    }

    const { data, error } = await supabase.from('users').update(patch).eq('id', req.params.id).select(SAFE_SELECT).single();
    if (error || !data) return res.status(404).json({ success: false, message: 'User not found' });

    if (req.body.module_access !== undefined) {
      await syncModuleAccess(data.id, req.body.module_access);
    }

    await createAuditLog({
      req, action: 'user_updated', module: 'Settings',
      entityType: 'user', entityId: data.id, newData: data
    });

    res.json({ success: true, data: await withModuleAccess(data) });
  } catch (err) {
    next(err);
  }
});

// DELETE /users/:id  -- Admin-only soft-delete (sets is_active=false)
router.delete('/:id', requirePermission('users.delete'), async (req, res, next) => {
  try {
    const { data: existing } = await supabase.from('users').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'User not found' });
    if (existing.id === (req.user && req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }

    const { data, error } = await supabase
      .from('users').update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select(SAFE_SELECT).single();
    if (error) throw error;

    await createAuditLog({
      req, action: 'user_deactivated', module: 'Settings',
      entityType: 'user', entityId: existing.id, oldData: existing, newData: data
    });

    res.json({ success: true, message: 'User deactivated', data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
