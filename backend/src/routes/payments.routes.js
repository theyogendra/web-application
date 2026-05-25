const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { optionalAuth, requirePermission } = require('../middleware/auth.middleware');
const { createAuditLog } = require('../services/audit.service');
const { sendPaymentReceiptEmail, sendInvoicePaidEmail } = require('../services/email.service');
const { toCsv } = require('../utils/csv');
const { sanitizeSearch } = require('../utils/escape');

router.use(optionalAuth);

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'upi', 'cheque', 'online'];

// Normalize free-text method labels ("Bank Transfer", "Online Payment") to
// the canonical stored values.
function normalizeMethod(m) {
  if (!m) return 'cash';
  const k = String(m).trim().toLowerCase().replace(/\s+/g, '_');
  const map = {
    cash: 'cash',
    bank_transfer: 'bank_transfer', banktransfer: 'bank_transfer', bank: 'bank_transfer',
    card: 'card', credit_card: 'card', debit_card: 'card',
    upi: 'upi',
    cheque: 'cheque', check: 'cheque',
    online: 'online', online_payment: 'online'
  };
  return map[k] || k;
}

// GET /payments  -- list with filters
router.get('/', async (req, res, next) => {
  try {
    const { invoice_id, payment_method, from, to, created_by } = req.query;
    const search = sanitizeSearch(req.query.search);

    let q = supabase
      .from('payments')
      .select('*, invoices(invoice_number, customer_name, customer_email)')
      .order('created_at', { ascending: false });

    if (invoice_id) q = q.eq('invoice_id', invoice_id);
    if (payment_method) q = q.eq('payment_method', normalizeMethod(payment_method));
    if (created_by) q = q.eq('created_by', created_by);
    if (from) q = q.gte('payment_date', from);
    if (to) q = q.lte('payment_date', to);
    if (search) q = q.or(`payment_number.ilike.%${search}%,reference_number.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /payments/export  -- CSV (registered before /:id so it is not shadowed)
router.get('/export', async (req, res, next) => {
  try {
    const { invoice_id, payment_method, from, to } = req.query;

    let q = supabase
      .from('payments')
      .select('*, invoices(invoice_number, customer_name)')
      .order('payment_date', { ascending: false });

    if (invoice_id) q = q.eq('invoice_id', invoice_id);
    if (payment_method) q = q.eq('payment_method', normalizeMethod(payment_method));
    if (from) q = q.gte('payment_date', from);
    if (to) q = q.lte('payment_date', to);

    const { data, error } = await q;
    if (error) throw error;

    const csv = toCsv(data || [], [
      { key: 'payment_number', label: 'Payment Number' },
      { label: 'Invoice', value: (r) => r.invoices && r.invoices.invoice_number },
      { label: 'Customer', value: (r) => r.invoices && r.invoices.customer_name },
      { key: 'amount', label: 'Amount' },
      { key: 'payment_method', label: 'Method' },
      { key: 'payment_date', label: 'Payment Date' },
      { key: 'reference_number', label: 'Reference' },
      { key: 'notes', label: 'Notes' },
      { key: 'created_at', label: 'Created At' }
    ]);

    await createAuditLog({ req, action: 'csv_exported', module: 'Payments', details: { count: (data || []).length } });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// GET /payments/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*, invoices(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /payments  -- record a payment, in pending-approval state.
// The invoice is NOT credited until an accountant approves via /approve.
router.post('/', requirePermission('payments.create'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const {
      invoice_id, amount, payment_method, payment_date,
      reference_number, notes
    } = req.body;

    if (!invoice_id) {
      return res.status(400).json({ success: false, message: 'invoice_id is required' });
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ success: false, message: 'amount must be greater than zero' });
    }

    const method = normalizeMethod(payment_method);
    if (!PAYMENT_METHODS.includes(method)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment method. Allowed: ${PAYMENT_METHODS.join(', ')}`
      });
    }

    // RPC inserts in approval_status='pending'; invoice unchanged until approval.
    const { data: result, error: rpcError } = await supabase.rpc('record_invoice_payment', {
      invoice_id_input: invoice_id,
      amount_input: amt,
      payment_method_input: method,
      payment_date_input: payment_date || null,
      reference_number_input: reference_number || null,
      notes_input: notes || null,
      user_id_input: userId
    });
    if (rpcError) throw rpcError;
    if (!result || !result.success) {
      return res.status(400).json(result || { success: false, message: 'Payment failed' });
    }

    const payment = result.payment;

    await createAuditLog({
      req,
      action: 'payment_recorded',
      module: 'Payments',
      entityType: 'payment',
      entityId: payment.id,
      newData: payment,
      details: { invoice_id, amount: amt, method, approval_status: 'pending' }
    });

    res.status(201).json({
      success: true,
      message: 'Payment recorded; awaiting approval',
      data: payment,
      invoice: {
        status: result.invoice_status,
        paid_amount: result.paid_amount,
        balance_due: result.balance_due
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /payments/:id/approve  -- Approver (Admin/Manager or any role granted
// payments.approve) flips status, recalculates invoice totals, and (when this
// brings the invoice to fully paid) deducts inventory stock + logs
// stock_movements.
router.post('/:id/approve', requirePermission('payments.approve'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { data: existing } = await supabase.from('payments').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Payment not found' });

    const { data: result, error: rpcError } = await supabase.rpc('approve_invoice_payment', {
      payment_id_input: req.params.id,
      user_id_input: userId
    });
    if (rpcError) throw rpcError;
    if (!result || !result.success) {
      return res.status(400).json(result || { success: false, message: 'Approval failed' });
    }

    const { data: updated } = await supabase.from('payments').select('*').eq('id', req.params.id).maybeSingle();

    await createAuditLog({
      req, action: 'payment_approved', module: 'Payments',
      entityType: 'payment', entityId: req.params.id,
      oldData: existing, newData: updated,
      details: {
        invoice_status: result.invoice_status,
        paid_amount: result.paid_amount,
        balance_due: result.balance_due,
        inventory_deducted: !!result.inventory_deducted
      }
    });

    // Receipt email is best-effort, fires on approval (the moment the
    // customer's payment is actually credited).
    let email = { skipped: true };
    try {
      const { data: invoice } = await supabase.from('invoices').select('*').eq('id', existing.invoice_id).maybeSingle();
      if (invoice && invoice.customer_email) {
        email = await sendPaymentReceiptEmail(invoice, updated);
        if (result.invoice_status === 'paid') {
          await sendInvoicePaidEmail(invoice);
        }
      }
    } catch (mailErr) {
      console.error('Receipt email failed:', mailErr.message);
      email = { success: false, message: mailErr.message };
    }

    res.json({
      success: true,
      message: 'Payment approved',
      data: updated,
      invoice: {
        status: result.invoice_status,
        paid_amount: result.paid_amount,
        balance_due: result.balance_due,
        inventory_deducted: !!result.inventory_deducted
      },
      email
    });
  } catch (err) {
    next(err);
  }
});

// POST /payments/:id/reject  -- Approver rejects a pending payment.
router.post('/:id/reject', requirePermission('payments.approve'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const reason = req.body && req.body.reason ? String(req.body.reason) : 'Rejected';

    const { data: existing } = await supabase.from('payments').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Payment not found' });

    const { data: result, error: rpcError } = await supabase.rpc('reject_invoice_payment', {
      payment_id_input: req.params.id,
      user_id_input: userId,
      reason_input: reason
    });
    if (rpcError) throw rpcError;
    if (!result || !result.success) {
      return res.status(400).json(result || { success: false, message: 'Rejection failed' });
    }

    const { data: updated } = await supabase.from('payments').select('*').eq('id', req.params.id).maybeSingle();

    await createAuditLog({
      req, action: 'payment_rejected', module: 'Payments',
      entityType: 'payment', entityId: req.params.id,
      oldData: existing, newData: updated, details: { reason }
    });

    res.json({ success: true, message: 'Payment rejected', data: updated });
  } catch (err) {
    next(err);
  }
});

// PUT /payments/:id  -- edit payment metadata (not the amount)
router.put('/:id', requirePermission('payments.update'), async (req, res, next) => {
  try {
    const { data: existing, error: findErr } = await supabase
      .from('payments').select('*').eq('id', req.params.id).single();

    if (findErr || !existing) return res.status(404).json({ success: false, message: 'Payment not found' });

    const patch = {};
    if (req.body.payment_method !== undefined) patch.payment_method = normalizeMethod(req.body.payment_method);
    if (req.body.payment_date !== undefined) patch.payment_date = req.body.payment_date;
    if (req.body.reference_number !== undefined) patch.reference_number = req.body.reference_number;
    if (req.body.notes !== undefined) patch.notes = req.body.notes;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ success: false, message: 'No editable fields provided' });
    }

    const { data: updated, error } = await supabase
      .from('payments').update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;

    await createAuditLog({
      req, action: 'payment_updated', module: 'Payments',
      entityType: 'payment', entityId: updated.id, oldData: existing, newData: updated
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /payments/:id  -- remove a payment and recalculate the invoice
router.delete('/:id', requirePermission('payments.delete'), async (req, res, next) => {
  try {
    const { data: existing, error: findErr } = await supabase
      .from('payments').select('*').eq('id', req.params.id).single();

    if (findErr || !existing) return res.status(404).json({ success: false, message: 'Payment not found' });

    const { error: delErr } = await supabase.from('payments').delete().eq('id', req.params.id);
    if (delErr) throw delErr;

    // Re-derive paid_amount / balance_due / status from remaining payments.
    const { data: recalc } = await supabase.rpc('recalculate_invoice_payment', {
      invoice_id_input: existing.invoice_id
    });

    await createAuditLog({
      req, action: 'payment_deleted', module: 'Payments',
      entityType: 'payment', entityId: existing.id, oldData: existing,
      details: { invoice_id: existing.invoice_id }
    });

    res.json({ success: true, message: 'Payment deleted', invoice: recalc || null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
