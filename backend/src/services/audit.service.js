const supabase = require('../config/supabase');

// Keys whose VALUE should be redacted before we serialize old_data/new_data
// into the audit log. Match is case-insensitive and substring-based.
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /private[_-]?key/i
];

function isSensitiveKey(key) {
  for (const p of SENSITIVE_KEY_PATTERNS) if (p.test(key)) return true;
  return false;
}

// Deep clone with sensitive values replaced by '[REDACTED]'. Safe for the
// arbitrary row shapes we feed in (depth-limited to avoid pathological cycles
// from Supabase joins that include `__proto__`-ish keys).
function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 8) return '[Object]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = isSensitiveKey(k) ? '[REDACTED]' : redact(value[k], depth + 1);
    }
    return out;
  }
  return value;
}

function safeClone(value) {
  try {
    return redact(JSON.parse(JSON.stringify(value)));
  } catch (e) {
    return { _serialization_error: e.message };
  }
}

// Derive the spec's audit-log "module" from an action name when the
// caller does not provide one explicitly.
function moduleForAction(action = '') {
  const a = String(action).toLowerCase();
  // Order matters: specific prefixes first, then catch-alls. e.g.
  // 'invoice_email_sent' must classify as Invoices, not Email.
  if (a === 'login' || a === 'logout') return 'Auth';
  if (a.startsWith('invoice')) return 'Invoices';
  if (a.startsWith('payment')) return 'Payments';
  if (a.startsWith('quotation')) return 'Quotations';
  if (a.startsWith('proposal')) return 'Proposals';
  if (a.startsWith('product') || a.includes('stock_adjusted')) return 'Inventory';
  if (a.startsWith('customer')) return 'Customers';
  if (a.startsWith('user') || a.startsWith('role')) return 'Settings';
  if (a.startsWith('report')) return 'Reports';
  if (a.includes('stock') || a.includes('approval')) return 'Invoices';
  if (a.includes('email')) return 'Email';
  if (a.includes('audit') || a.includes('csv_exported')) return 'Audit Logs';
  if (a.includes('setting')) return 'Settings';
  return 'System';
}

// Last-resort dead-letter for audit rows we couldn't insert. If THIS write
// fails too we log to stderr — that's a terminal sink we can scrape.
async function writeToDeadLetter(payload, errorMessage) {
  try {
    const { error } = await supabase.from('audit_logs_failed').insert([{
      payload,
      error_message: errorMessage
    }]);
    if (error) {
      console.error('audit_logs_failed insert also failed:', error.message, '\noriginal payload:', JSON.stringify(payload));
    }
  } catch (e) {
    console.error('audit_logs_failed write threw:', e.message, '\noriginal payload:', JSON.stringify(payload));
  }
}

/**
 * Write an audit log entry. Backward compatible with the original
 * { userId, action, entityType, entityId, oldData, newData, ipAddress }
 * shape, and additionally supports { userName, module, details, userAgent }
 * plus a `req` object to auto-fill user / ip / user-agent.
 *
 * old_data / new_data / details are PII-redacted (passwords, tokens, etc.)
 * before insert. If the insert fails the full payload is written to
 * audit_logs_failed instead of being silently dropped.
 */
async function createAuditLog(opts = {}) {
  const {
    userId, userName, action,
    module: mod, entityType, entityId,
    oldData, newData, details,
    ipAddress, userAgent, req
  } = opts;

  const row = {
    user_id: userId || (req && req.user ? req.user.id : null) || null,
    user_name: userName || (req && req.user ? req.user.email : null) || null,
    action,
    module: mod || moduleForAction(action),
    entity_type: entityType || null,
    entity_id: entityId || null,
    old_data: oldData ? safeClone(oldData) : null,
    new_data: newData ? safeClone(newData) : null,
    details: details ? safeClone(details) : null,
    ip_address: ipAddress || (req ? req.ip : null) || null,
    user_agent: userAgent || (req && req.headers ? req.headers['user-agent'] : null) || null
  };

  try {
    const { error } = await supabase.from('audit_logs').insert([row]);
    if (error) {
      console.error('Failed to create audit log:', error.message);
      await writeToDeadLetter(row, error.message);
    }
  } catch (err) {
    console.error('Error in createAuditLog:', err.message);
    await writeToDeadLetter(row, err.message);
  }
}

module.exports = { createAuditLog, moduleForAction, redact };
