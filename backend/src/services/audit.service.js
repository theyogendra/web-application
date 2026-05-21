const supabase = require('../config/supabase');

const createAuditLog = async ({
  userId,
  action,
  entityType,
  entityId,
  oldData,
  newData,
  ipAddress
}) => {
  try {
    const { error } = await supabase.from('audit_logs').insert([{
      user_id: userId || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      old_data: oldData ? JSON.parse(JSON.stringify(oldData)) : null,
      new_data: newData ? JSON.parse(JSON.stringify(newData)) : null,
      ip_address: ipAddress || null
    }]);

    if (error) {
      console.error('Failed to create audit log:', error.message, error.details);
    }
  } catch (err) {
    console.error('Error in createAuditLog:', err);
  }
};

module.exports = {
  createAuditLog
};
