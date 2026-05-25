const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { optionalAuth, requirePermission } = require('../middleware/auth.middleware');
const { createAuditLog } = require('../services/audit.service');
const { generateQuotationNumber, generateInvoiceNumber } = require('../services/numbering.service');
const { generateQuotationPdf } = require('../services/pdf.service');
const { sendQuotationEmail } = require('../services/email.service');
const { calculateTotals } = require('../services/totals.service');
const { sanitizeSearch } = require('../utils/escape');

router.use(optionalAuth);

const SELECT_LIST = '*';
const SELECT_FULL = '*, quotation_items(*), invoices!converted_to_invoice_id(id,invoice_number,status), proposals!converted_from_proposal_id(id,proposal_number)';

const todayIso = () => new Date().toISOString().slice(0, 10);

// is_expired = valid_until in the past, status still draft/sent (i.e. open)
function withDerived(q) {
  const today = todayIso();
  const open = ['draft', 'sent'].includes(q.status);
  return { ...q, is_expired: open && !!q.valid_until && q.valid_until < today };
}

// GET /quotations  -- list
router.get('/', async (req, res, next) => {
  try {
    const { status, from, to } = req.query;
    const customer = sanitizeSearch(req.query.customer);
    const search = sanitizeSearch(req.query.search);
    let q = supabase.from('quotations').select(SELECT_LIST).order('created_at', { ascending: false });

    if (status) q = q.eq('status', status);
    if (customer) q = q.ilike('customer_name', `%${customer}%`);
    if (from) q = q.gte('quotation_date', from);
    if (to) q = q.lte('quotation_date', to);
    if (search) q = q.or(`quotation_number.ilike.%${search}%,customer_name.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data: (data || []).map(withDerived) });
  } catch (err) {
    next(err);
  }
});

// GET /quotations/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('quotations').select(SELECT_FULL).eq('id', req.params.id).maybeSingle();
    if (error || !data) return res.status(404).json({ success: false, message: 'Quotation not found' });
    res.json({ success: true, data: withDerived(data) });
  } catch (err) {
    next(err);
  }
});

// POST /quotations  -- create (auto-numbered, items computed)
// Insert is atomic via create_quotation_with_items RPC (phase 8): the
// quotation row + items either all commit or none do.
router.post('/', requirePermission('quotations.create'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const calc = calculateTotals(req.body.items || []);
    const quotationNumber = req.body.quotation_number || await generateQuotationNumber();

    const quotationInput = {
      quotation_number: quotationNumber,
      customer_id: req.body.customer_id || null,
      customer_name: req.body.customer_name || null,
      customer_email: req.body.customer_email || null,
      customer_phone: req.body.customer_phone || null,
      billing_address: req.body.billing_address || null,
      quotation_date: req.body.quotation_date || todayIso(),
      valid_until: req.body.valid_until || null,
      status: 'draft',
      notes: req.body.notes || null,
      terms: req.body.terms || null,
      subtotal: calc.totals.subtotal,
      discount: calc.totals.discount,
      tax_amount: calc.totals.tax_amount,
      grand_total: calc.totals.grand_total,
      created_by: userId
    };

    const { data: result, error: rpcError } = await supabase.rpc('create_quotation_with_items', {
      q_input: quotationInput,
      items_input: calc.items
    });
    if (rpcError) throw rpcError;
    if (!result || !result.success) {
      return res.status(400).json(result || { success: false, message: 'Create failed' });
    }

    const { data: row } = await supabase.from('quotations').select('*').eq('id', result.quotation_id).maybeSingle();

    await createAuditLog({
      req, action: 'quotation_created', module: 'Quotations',
      entityType: 'quotation', entityId: result.quotation_id, newData: row
    });

    res.status(201).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// PUT /quotations/:id  -- edit (drafts/sent only; replaces items wholesale)
// Update is atomic via update_quotation_with_items RPC (phase 8).
router.put('/:id', requirePermission('quotations.update'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { data: existing } = await supabase.from('quotations').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Quotation not found' });
    if (['converted', 'cancelled'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: `Cannot edit a ${existing.status} quotation` });
    }

    const calc = calculateTotals(req.body.items || []);
    const patch = { updated_by: userId };

    [
      'quotation_number', 'customer_id', 'customer_name', 'customer_email', 'customer_phone',
      'billing_address', 'quotation_date', 'valid_until', 'notes', 'terms'
    ].forEach((f) => { if (req.body[f] !== undefined) patch[f] = req.body[f]; });

    if (req.body.items) {
      patch.subtotal    = calc.totals.subtotal;
      patch.discount    = calc.totals.discount;
      patch.tax_amount  = calc.totals.tax_amount;
      patch.grand_total = calc.totals.grand_total;
    }
    if (req.body.status && ['draft', 'sent'].includes(req.body.status)) patch.status = req.body.status;

    const { data: result, error: rpcError } = await supabase.rpc('update_quotation_with_items', {
      quotation_id_input: req.params.id,
      q_input: patch,
      items_input: req.body.items ? calc.items : null
    });
    if (rpcError) throw rpcError;
    if (!result || !result.success) {
      return res.status(400).json(result || { success: false, message: 'Update failed' });
    }

    const { data: row } = await supabase.from('quotations').select('*').eq('id', result.quotation_id).maybeSingle();

    await createAuditLog({
      req, action: 'quotation_updated', module: 'Quotations',
      entityType: 'quotation', entityId: result.quotation_id, oldData: existing, newData: row
    });

    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// DELETE /quotations/:id  -- drafts hard-delete; everything else cancels.
router.delete('/:id', requirePermission('quotations.delete'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { data: existing } = await supabase.from('quotations').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Quotation not found' });
    if (existing.status === 'converted') {
      return res.status(400).json({ success: false, message: 'A converted quotation cannot be deleted' });
    }

    if (existing.status === 'draft') {
      const { error } = await supabase.from('quotations').delete().eq('id', req.params.id);
      if (error) throw error;
      await createAuditLog({
        req, action: 'quotation_deleted', module: 'Quotations',
        entityType: 'quotation', entityId: existing.id, oldData: existing
      });
      return res.json({ success: true, message: 'Quotation deleted', deleted: true });
    }

    const { data: row, error } = await supabase
      .from('quotations').update({ status: 'cancelled', updated_by: userId, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;

    await createAuditLog({
      req, action: 'quotation_cancelled', module: 'Quotations',
      entityType: 'quotation', entityId: existing.id, oldData: existing, newData: row
    });
    res.json({ success: true, message: 'Quotation cancelled', data: row, deleted: false });
  } catch (err) {
    next(err);
  }
});

// POST /quotations/:id/send
router.post('/:id/send', requirePermission('quotations.send'), async (req, res, next) => {
  try {
    const { data: row, error } = await supabase
      .from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).maybeSingle();
    if (error || !row) return res.status(404).json({ success: false, message: 'Quotation not found' });
    if (!row.customer_email) {
      return res.status(400).json({ success: false, message: 'Quotation has no customer email address' });
    }

    const { data: company } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();

    let pdfBuffer;
    try {
      pdfBuffer = await generateQuotationPdf(row, row.quotation_items || [], company || {});
    } catch (pdfErr) {
      console.error('Quotation PDF generation failed:', pdfErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate the quotation PDF. The quotation was not sent.',
        detail: pdfErr.message
      });
    }

    const emailResult = await sendQuotationEmail(row, pdfBuffer);

    let updated = row;
    if (emailResult.success) {
      const patch = {};
      if (row.status === 'draft') patch.status = 'sent';
      if (!row.sent_at) patch.sent_at = new Date().toISOString();
      if (Object.keys(patch).length > 0) {
        const { data: u, error: upErr } = await supabase
          .from('quotations').update(patch).eq('id', row.id).select().single();
        if (upErr) console.error('Failed to mark quotation as sent:', upErr.message);
        if (u) updated = u;
      }
    }

    await createAuditLog({
      req,
      action: emailResult.success
        ? 'quotation_sent'
        : (emailResult.skipped ? 'quotation_send_skipped' : 'quotation_send_failed'),
      module: 'Quotations',
      entityType: 'quotation', entityId: row.id,
      details: { to: row.customer_email, email_status: emailResult }
    });

    const status = emailResult.success ? 200 : (emailResult.skipped ? 200 : 502);
    res.status(status).json({
      success: !!emailResult.success,
      skipped: !!emailResult.skipped,
      message: emailResult.success
        ? 'Quotation sent successfully'
        : (emailResult.skipped
          ? 'Email skipped: RESEND_API_KEY not configured.'
          : `Email delivery failed: ${emailResult.message || 'unknown error'}`),
      data: updated,
      email: emailResult
    });
  } catch (err) {
    next(err);
  }
});

// GET /quotations/:id/pdf
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const { data: row, error } = await supabase
      .from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).maybeSingle();
    if (error || !row) return res.status(404).json({ success: false, message: 'Quotation not found' });

    const { data: company } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();
    const pdfBuffer = await generateQuotationPdf(row, row.quotation_items || [], company || {});

    await createAuditLog({
      req, action: 'quotation_downloaded', module: 'Quotations',
      entityType: 'quotation', entityId: row.id
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${row.quotation_number || 'quotation'}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// POST /quotations/:id/mark-accepted
// Workflow: marking a quotation accepted is the quotation team's approval —
// it immediately spawns a linked draft Invoice for the invoice team to review.
router.post('/:id/mark-accepted', requirePermission('quotations.approve'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { data: existing } = await supabase.from('quotations').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Quotation not found' });
    if (!['draft', 'sent'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: `Cannot accept a ${existing.status} quotation` });
    }

    // 1. Mark quotation accepted
    const { data: row, error } = await supabase
      .from('quotations').update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;

    await createAuditLog({
      req, action: 'quotation_accepted', module: 'Quotations',
      entityType: 'quotation', entityId: row.id, oldData: existing, newData: row
    });

    // 2. Auto-convert to invoice. The convert RPC will flip the quotation
    //    status to 'converted' which supersedes 'accepted' as the terminal
    //    state; that's intentional — the working doc is the invoice now.
    let invoice = null;
    try {
      const { data: convResult, error: convErr } = await supabase.rpc('convert_quotation_to_invoice', {
        quotation_id_input: req.params.id,
        due_date_input: req.body.due_date || null,
        user_id_input: userId
      });
      if (convErr) throw convErr;
      if (convResult && convResult.success) {
        ({ data: invoice } = await supabase.from('invoices').select('*').eq('id', convResult.invoice_id).maybeSingle());
        await createAuditLog({
          req, action: 'quotation_converted_to_invoice', module: 'Quotations',
          entityType: 'quotation', entityId: req.params.id,
          details: { invoice_id: convResult.invoice_id, invoice_number: convResult.invoice_number, auto: true }
        });
      }
    } catch (convErr) {
      console.error('Auto-conversion to invoice failed:', convErr.message);
    }

    res.json({ success: true, data: row, invoice });
  } catch (err) {
    next(err);
  }
});

// POST /quotations/:id/mark-rejected
router.post('/:id/mark-rejected', requirePermission('quotations.update'), async (req, res, next) => {
  try {
    const { data: existing } = await supabase.from('quotations').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Quotation not found' });
    if (!['draft', 'sent'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: `Cannot reject a ${existing.status} quotation` });
    }

    const { data: row, error } = await supabase
      .from('quotations').update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;

    await createAuditLog({
      req, action: 'quotation_rejected', module: 'Quotations',
      entityType: 'quotation', entityId: row.id, oldData: existing, newData: row
    });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// POST /quotations/:id/convert-to-invoice
// Atomic via the convert_quotation_to_invoice RPC (phase 7 migration) —
// the destination invoice, its items, and the source-status update either
// all commit or none of them do.
router.post('/:id/convert-to-invoice', requirePermission('quotations.convert'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;

    const { data: result, error: rpcError } = await supabase.rpc('convert_quotation_to_invoice', {
      quotation_id_input: req.params.id,
      due_date_input: req.body.due_date || null,
      user_id_input: userId
    });

    if (rpcError) throw rpcError;
    if (!result || !result.success) {
      return res.status(400).json(result || { success: false, message: 'Conversion failed' });
    }

    // Re-fetch both sides for the response so the frontend can navigate.
    const [{ data: invoice }, { data: updatedQuotation }] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', result.invoice_id).maybeSingle(),
      supabase.from('quotations').select('*').eq('id', req.params.id).maybeSingle()
    ]);

    await createAuditLog({
      req, action: 'quotation_converted_to_invoice', module: 'Quotations',
      entityType: 'quotation', entityId: req.params.id,
      details: { invoice_id: result.invoice_id, invoice_number: result.invoice_number }
    });

    res.status(201).json({
      success: true,
      message: 'Quotation converted to invoice',
      data: { invoice, quotation: updatedQuotation }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
