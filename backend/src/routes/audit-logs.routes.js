const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { optionalAuth, requirePermission } = require('../middleware/auth.middleware');
const { createAuditLog } = require('../services/audit.service');
const { toCsv } = require('../utils/csv');
const { sanitizeSearch } = require('../utils/escape');

router.use(optionalAuth);
// Audit logs are Admin/Manager only (any role missing `audit_logs.read` is
// rejected). Employees never see this module.
router.use(requirePermission('audit_logs.read'));

function applyFilters(q, query) {
  const { module, action, user_id, from, to } = query;
  const search = sanitizeSearch(query.search);
  if (module) q = q.eq('module', module);
  if (action) q = q.eq('action', action);
  if (user_id) q = q.eq('user_id', user_id);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to + 'T23:59:59.999Z');
  if (search) q = q.or(`action.ilike.*${search}*,user_name.ilike.*${search}*`);
  return q;
}

// GET /audit-logs  -- list with filters
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
    q = applyFilters(q, req.query);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /audit-logs/export  -- CSV
router.get('/export', async (req, res, next) => {
  try {
    let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(5000);
    q = applyFilters(q, req.query);

    const { data, error } = await q;
    if (error) throw error;

    const csv = toCsv(data || [], [
      { key: 'created_at', label: 'Timestamp' },
      { key: 'user_name', label: 'User' },
      { key: 'action', label: 'Action' },
      { key: 'module', label: 'Module' },
      { key: 'entity_type', label: 'Entity Type' },
      { key: 'entity_id', label: 'Entity Id' },
      { key: 'ip_address', label: 'IP Address' },
      { label: 'Details', value: (r) => (r.details ? JSON.stringify(r.details) : '') }
    ]);

    await createAuditLog({ req, action: 'csv_exported', module: 'Audit Logs', details: { count: (data || []).length } });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
