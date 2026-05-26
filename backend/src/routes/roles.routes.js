const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth.middleware');
const { createAuditLog } = require('../services/audit.service');

router.use(authenticate);

// GET /roles
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('roles').select('*').order('name', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /roles/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('roles').select('*').eq('id', req.params.id).maybeSingle();
    if (error || !data) return res.status(404).json({ success: false, message: 'Role not found' });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /roles
router.post('/', async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name is required' });

    const { data, error } = await supabase.from('roles').insert([{
      name,
      description: description || null,
      permissions: Array.isArray(permissions) ? permissions : [],
      is_system: false
    }]).select().single();
    if (error) throw error;

    await createAuditLog({
      req, action: 'role_created', module: 'Settings',
      entityType: 'role', entityId: data.id, newData: data
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// PUT /roles/:id  -- system roles cannot be renamed but their permissions can be updated
router.put('/:id', async (req, res, next) => {
  try {
    const { data: existing } = await supabase.from('roles').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Role not found' });

    const patch = { updated_at: new Date().toISOString() };
    if (req.body.permissions !== undefined) patch.permissions = req.body.permissions;
    if (req.body.description !== undefined) patch.description = req.body.description;
    if (!existing.is_system && req.body.name !== undefined) patch.name = req.body.name;

    const { data, error } = await supabase.from('roles').update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;

    await createAuditLog({
      req, action: 'role_updated', module: 'Settings',
      entityType: 'role', entityId: data.id, oldData: existing, newData: data
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// DELETE /roles/:id  -- system roles are protected
router.delete('/:id', async (req, res, next) => {
  try {
    const { data: existing } = await supabase.from('roles').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Role not found' });
    if (existing.is_system) {
      return res.status(400).json({ success: false, message: 'System roles cannot be deleted' });
    }

    const { error } = await supabase.from('roles').delete().eq('id', req.params.id);
    if (error) throw error;

    await createAuditLog({
      req, action: 'role_deleted', module: 'Settings',
      entityType: 'role', entityId: existing.id, oldData: existing
    });

    res.json({ success: true, message: 'Role deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
