const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { optionalAuth, requirePermission } = require('../middleware/auth.middleware');
const { createAuditLog } = require('../services/audit.service');
const { generateProposalNumber, generateQuotationNumber } = require('../services/numbering.service');
const { generateProposalPdf } = require('../services/pdf.service');
const { sendProposalEmail } = require('../services/email.service');
const { calculateTotals } = require('../services/totals.service');
const { sanitizeSearch } = require('../utils/escape');

router.use(optionalAuth);

const SELECT_LIST = '*';
const SELECT_FULL = '*, proposal_items(*), quotations!converted_to_quotation_id(id, quotation_number, status, invoices!converted_to_invoice_id(id, invoice_number, status))';

const todayIso = () => new Date().toISOString().slice(0, 10);

function withDerived(p) {
  const today = todayIso();
  const open = ['draft', 'sent'].includes(p.status);
  return { ...p, is_expired: open && !!p.valid_until && p.valid_until < today };
}

// GET /proposals  -- list
router.get('/', async (req, res, next) => {
  try {
    const { status, from, to } = req.query;
    const customer = sanitizeSearch(req.query.customer);
    const search = sanitizeSearch(req.query.search);
    let q = supabase.from('proposals').select(SELECT_LIST).order('created_at', { ascending: false });

    if (status) q = q.eq('status', status);
    if (customer) q = q.ilike('customer_name', `%${customer}%`);
    if (from) q = q.gte('proposal_date', from);
    if (to) q = q.lte('proposal_date', to);
    if (search) q = q.or(`proposal_number.ilike.*${search}*,customer_name.ilike.*${search}*`);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data: (data || []).map(withDerived) });
  } catch (err) {
    next(err);
  }
});

// GET /proposals/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('proposals').select(SELECT_FULL).eq('id', req.params.id).maybeSingle();
    if (error || !data) return res.status(404).json({ success: false, message: 'Proposal not found' });
    res.json({ success: true, data: withDerived(data) });
  } catch (err) {
    next(err);
  }
});

// POST /proposals  -- create
// Atomic via create_proposal_with_items RPC (phase 8).
router.post('/', requirePermission('proposals.create'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const calc = calculateTotals(req.body.items || []);
    const proposalNumber = req.body.proposal_number || await generateProposalNumber();

    const proposalInput = {
      proposal_number: proposalNumber,
      customer_id: req.body.customer_id || null,
      customer_name: req.body.customer_name || null,
      customer_email: req.body.customer_email || null,
      customer_phone: req.body.customer_phone || null,
      billing_address: req.body.billing_address || null,
      proposal_date: req.body.proposal_date || todayIso(),
      valid_until: req.body.valid_until || null,
      status: 'draft',
      notes: req.body.notes || null,
      terms: req.body.terms || null,
      scope: req.body.scope || null,
      subtotal: calc.totals.subtotal,
      discount: calc.totals.discount,
      tax_amount: calc.totals.tax_amount,
      grand_total: calc.totals.grand_total,
      created_by: userId
    };

    const { data: result, error: rpcError } = await supabase.rpc('create_proposal_with_items', {
      p_input: proposalInput,
      items_input: calc.items
    });
    if (rpcError) throw rpcError;
    if (!result || !result.success) {
      return res.status(400).json(result || { success: false, message: 'Create failed' });
    }

    let row;
    ({ data: row } = await supabase.from('proposals').select('*').eq('id', result.proposal_id).maybeSingle());

    await createAuditLog({
      req, action: 'proposal_created', module: 'Proposals',
      entityType: 'proposal', entityId: result.proposal_id, newData: row
    });

    // Workflow: a new proposal immediately spawns a linked draft quotation
    // so the quotation team picks it up for review.
    let quotation = null;
    try {
      const { data: convResult, error: convErr } = await supabase.rpc('convert_proposal_to_quotation', {
        proposal_id_input: result.proposal_id,
        valid_until_input: req.body.valid_until || null,
        user_id_input: userId
      });
      if (convErr) throw convErr;
      if (convResult && convResult.success) {
        ({ data: quotation } = await supabase.from('quotations').select('*').eq('id', convResult.quotation_id).maybeSingle());
        // Refresh the proposal row — the convert RPC marked it as 'converted'.
        ({ data: row } = await supabase.from('proposals').select('*').eq('id', result.proposal_id).maybeSingle());

        await createAuditLog({
          req, action: 'proposal_converted_to_quotation', module: 'Proposals',
          entityType: 'proposal', entityId: result.proposal_id,
          details: { quotation_id: convResult.quotation_id, quotation_number: convResult.quotation_number, auto: true }
        });
      }
    } catch (convErr) {
      console.error('Auto-conversion to quotation failed:', convErr.message);
      // The proposal still exists — caller will see proposal in response and
      // can retry conversion manually via /convert-to-quotation.
    }

    res.status(201).json({ success: true, data: row, quotation });
  } catch (err) {
    next(err);
  }
});

// PUT /proposals/:id
// Atomic via update_proposal_with_items RPC (phase 8).
router.put('/:id', requirePermission('proposals.update'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { data: existing } = await supabase.from('proposals').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Proposal not found' });
    if (['converted', 'cancelled'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: `Cannot edit a ${existing.status} proposal` });
    }

    const calc = calculateTotals(req.body.items || []);
    const patch = { updated_by: userId };

    [
      'proposal_number', 'customer_id', 'customer_name', 'customer_email', 'customer_phone',
      'billing_address', 'proposal_date', 'valid_until', 'notes', 'terms', 'scope'
    ].forEach((f) => { if (req.body[f] !== undefined) patch[f] = req.body[f]; });

    if (req.body.items) {
      patch.subtotal    = calc.totals.subtotal;
      patch.discount    = calc.totals.discount;
      patch.tax_amount  = calc.totals.tax_amount;
      patch.grand_total = calc.totals.grand_total;
    }
    if (req.body.status && ['draft', 'sent'].includes(req.body.status)) patch.status = req.body.status;

    const { data: result, error: rpcError } = await supabase.rpc('update_proposal_with_items', {
      proposal_id_input: req.params.id,
      p_input: patch,
      items_input: req.body.items ? calc.items : null
    });
    if (rpcError) throw rpcError;
    if (!result || !result.success) {
      return res.status(400).json(result || { success: false, message: 'Update failed' });
    }

    const { data: row } = await supabase.from('proposals').select('*').eq('id', result.proposal_id).maybeSingle();

    await createAuditLog({
      req, action: 'proposal_updated', module: 'Proposals',
      entityType: 'proposal', entityId: result.proposal_id, oldData: existing, newData: row
    });

    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// DELETE /proposals/:id
// Atomic via terminate_proposal RPC (phase 11): drafts are hard-deleted,
// everything else is cancelled. Linked quotation in open state is cascade-
// rejected in the same Postgres transaction.
router.delete('/:id', requirePermission('proposals.delete'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { data: existing } = await supabase.from('proposals').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Proposal not found' });

    const { data: result, error: rpcErr } = await supabase.rpc('terminate_proposal', {
      proposal_id_input: req.params.id,
      user_id_input: userId
    });
    if (rpcErr) throw rpcErr;
    if (!result || !result.success) {
      return res.status(400).json(result || { success: false, message: 'Terminate failed' });
    }

    const cascaded = result.cascaded || null;
    const updated = result.hard_deleted
      ? null
      : (await supabase.from('proposals').select('*').eq('id', req.params.id).maybeSingle()).data;

    // Audit: primary action
    await createAuditLog({
      req,
      action: result.hard_deleted ? 'proposal_deleted' : 'proposal_cancelled',
      module: 'Proposals',
      entityType: 'proposal', entityId: existing.id,
      oldData: existing, newData: updated,
      details: cascaded ? {
        cascaded_quotation_id: cascaded.id,
        cascaded_quotation_number: cascaded.quotation_number
      } : null
    });

    // Audit: cascade target (so quotation history shows why it died)
    if (cascaded) {
      await createAuditLog({
        req, action: 'quotation_cascade_rejected', module: 'Quotations',
        entityType: 'quotation', entityId: cascaded.id,
        details: {
          reason: result.hard_deleted ? 'parent proposal deleted' : 'parent proposal cancelled',
          proposal_id: existing.id,
          proposal_number: existing.proposal_number
        }
      });
    }

    res.json({
      success: true,
      message: result.hard_deleted ? 'Proposal deleted' : 'Proposal cancelled',
      data: updated,
      deleted: result.hard_deleted,
      cascaded
    });
  } catch (err) {
    next(err);
  }
});

// POST /proposals/:id/send
router.post('/:id/send', requirePermission('proposals.send'), async (req, res, next) => {
  try {
    const { data: row, error } = await supabase
      .from('proposals').select('*, proposal_items(*)').eq('id', req.params.id).maybeSingle();
    if (error || !row) return res.status(404).json({ success: false, message: 'Proposal not found' });
    if (!row.customer_email) {
      return res.status(400).json({ success: false, message: 'Proposal has no customer email address' });
    }

    const { data: company } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();

    let pdfBuffer;
    try {
      pdfBuffer = await generateProposalPdf(row, row.proposal_items || [], company || {});
    } catch (pdfErr) {
      console.error('Proposal PDF generation failed:', pdfErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate the proposal PDF. The proposal was not sent.',
        detail: pdfErr.message
      });
    }

    const emailResult = await sendProposalEmail(row, pdfBuffer);

    let updated = row;
    if (emailResult.success) {
      const patch = {};
      if (row.status === 'draft') patch.status = 'sent';
      if (!row.sent_at) patch.sent_at = new Date().toISOString();
      if (Object.keys(patch).length > 0) {
        const { data: u, error: upErr } = await supabase
          .from('proposals').update(patch).eq('id', row.id).select().single();
        if (upErr) console.error('Failed to mark proposal as sent:', upErr.message);
        if (u) updated = u;
      }
    }

    await createAuditLog({
      req,
      action: emailResult.success
        ? 'proposal_sent'
        : (emailResult.skipped ? 'proposal_send_skipped' : 'proposal_send_failed'),
      module: 'Proposals',
      entityType: 'proposal', entityId: row.id,
      details: { to: row.customer_email, email_status: emailResult }
    });

    const status = emailResult.success ? 200 : (emailResult.skipped ? 200 : 502);
    res.status(status).json({
      success: !!emailResult.success,
      skipped: !!emailResult.skipped,
      message: emailResult.success
        ? 'Proposal sent successfully'
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

// GET /proposals/:id/pdf
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const { data: row, error } = await supabase
      .from('proposals').select('*, proposal_items(*)').eq('id', req.params.id).maybeSingle();
    if (error || !row) return res.status(404).json({ success: false, message: 'Proposal not found' });

    const { data: company } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();
    const pdfBuffer = await generateProposalPdf(row, row.proposal_items || [], company || {});

    await createAuditLog({
      req, action: 'proposal_downloaded', module: 'Proposals',
      entityType: 'proposal', entityId: row.id
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${row.proposal_number || 'proposal'}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// POST /proposals/:id/mark-accepted
router.post('/:id/mark-accepted', requirePermission('proposals.update'), async (req, res, next) => {
  try {
    const { data: existing } = await supabase.from('proposals').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Proposal not found' });
    if (!['draft', 'sent'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: `Cannot accept a ${existing.status} proposal` });
    }

    const { data: row, error } = await supabase
      .from('proposals').update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;

    await createAuditLog({
      req, action: 'proposal_accepted', module: 'Proposals',
      entityType: 'proposal', entityId: row.id, oldData: existing, newData: row
    });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// POST /proposals/:id/mark-rejected
router.post('/:id/mark-rejected', requirePermission('proposals.update'), async (req, res, next) => {
  try {
    const { data: existing } = await supabase.from('proposals').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Proposal not found' });
    if (!['draft', 'sent'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: `Cannot reject a ${existing.status} proposal` });
    }

    const { data: row, error } = await supabase
      .from('proposals').update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;

    await createAuditLog({
      req, action: 'proposal_rejected', module: 'Proposals',
      entityType: 'proposal', entityId: row.id, oldData: existing, newData: row
    });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// POST /proposals/:id/convert-to-quotation
// Atomic via the convert_proposal_to_quotation RPC (phase 7 migration).
router.post('/:id/convert-to-quotation', requirePermission('proposals.convert'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;

    const { data: result, error: rpcError } = await supabase.rpc('convert_proposal_to_quotation', {
      proposal_id_input: req.params.id,
      valid_until_input: req.body.valid_until || null,
      user_id_input: userId
    });

    if (rpcError) throw rpcError;
    if (!result || !result.success) {
      return res.status(400).json(result || { success: false, message: 'Conversion failed' });
    }

    const [{ data: quotation }, { data: updatedProposal }] = await Promise.all([
      supabase.from('quotations').select('*').eq('id', result.quotation_id).maybeSingle(),
      supabase.from('proposals').select('*').eq('id', req.params.id).maybeSingle()
    ]);

    await createAuditLog({
      req, action: 'proposal_converted_to_quotation', module: 'Proposals',
      entityType: 'proposal', entityId: req.params.id,
      details: { quotation_id: result.quotation_id, quotation_number: result.quotation_number }
    });

    res.status(201).json({
      success: true,
      message: 'Proposal converted to quotation',
      data: { quotation, proposal: updatedProposal }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
