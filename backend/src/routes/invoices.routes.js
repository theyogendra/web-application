const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { validateInvoicePayload } = require('../services/invoice-validation.service');
const { createAuditLog } = require('../services/audit.service');
const { requirePermission, authenticate, optionalAuth } = require('../middleware/auth.middleware');
const { generateInvoiceNumber } = require('../services/numbering.service');
const { generateInvoicePdf } = require('../services/pdf.service');
const { sendInvoiceEmail, sendOverdueReminderEmail } = require('../services/email.service');
const { isOverdue } = require('../services/reports.service');
const { sanitizeSearch } = require('../utils/escape');

router.use(optionalAuth);

// GET all invoices (supports status / customer / search / date-range filters)
router.get('/', async (req, res, next) => {
  try {
    const { status, from, to } = req.query;
    const customer = sanitizeSearch(req.query.customer);
    const search = sanitizeSearch(req.query.search);

    let q = supabase
      .from('invoices')
      .select('*, customers(name), vendors(name)')
      .order('created_at', { ascending: false });

    if (status) q = q.eq('status', status);
    if (customer) q = q.ilike('customer_name', `%${customer}%`);
    if (from) q = q.gte('invoice_date', from);
    if (to) q = q.lte('invoice_date', to);
    if (search) q = q.or(`invoice_number.ilike.%${search}%,customer_name.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) throw error;

    res.json({
      success: true,
      data: (data || []).map((inv) => ({ ...inv, is_overdue: isOverdue(inv) }))
    });
  } catch (err) {
    next(err);
  }
});

// GET single invoice by id (with items + payments)
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*), payments(*), customers(name, email, billing_address, gst_number), vendors(name, email, billing_address, gst_number)')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Invoice not found' });

    res.json({ ...data, is_overdue: isOverdue(data) });
  } catch (err) {
    next(err);
  }
});

// CREATE invoice (Draft)
router.post('/', requirePermission('invoices.create'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    
    // Run Validation
    const validation = await validateInvoicePayload(req.body, { isUpdate: false });
    
    // Even if validation fails, for Phase 2 POST we just save the draft and warnings, unless strictly blocked.
    // The prompt says: "status remains draft, validation_status can be pending or passed depending on result"
    const validationStatus = validation.isValid ? 'passed' : 'failed';
    
    const { subtotal, discount_amount, tax_amount, grand_total } = validation.calculatedTotals;

    // Auto-generate a sequential invoice number when one is not supplied.
    const invoiceNumber = req.body.invoice_number || await generateInvoiceNumber();

    // Atomic insert via create_invoice_with_items RPC (phase 8): invoice +
    // items either both commit or both rollback.
    const invoiceInput = {
      invoice_number: invoiceNumber,
      customer_id: req.body.customer_id || null,
      vendor_id: req.body.vendor_id || null,
      customer_name: req.body.customer_name || null,
      customer_email: req.body.customer_email || null,
      customer_phone: req.body.customer_phone || null,
      billing_address: req.body.billing_address || null,
      invoice_date: req.body.invoice_date || new Date().toISOString().slice(0, 10),
      due_date: req.body.due_date || null,
      notes: req.body.notes || null,
      terms: req.body.terms || null,
      status: 'draft',
      validation_status: validationStatus,
      validation_errors: validation.errors,
      validation_warnings: validation.warnings,
      subtotal,
      discount: discount_amount,
      tax_amount,
      grand_total,
      paid_amount: 0,
      balance_due: grand_total,
      created_by: userId
    };

    const { data: result, error: rpcError } = await supabase.rpc('create_invoice_with_items', {
      invoice_input: invoiceInput,
      items_input: validation.normalizedItems
    });
    if (rpcError) throw rpcError;
    if (!result || !result.success) {
      return res.status(400).json(result || { success: false, message: 'Create failed' });
    }

    const { data: invoice } = await supabase.from('invoices').select('*').eq('id', result.invoice_id).maybeSingle();

    await createAuditLog({
      userId,
      action: 'invoice_created',
      entityType: 'invoice',
      entityId: result.invoice_id,
      oldData: null,
      newData: invoice,
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      data: invoice,
      warnings: validation.warnings,
      errors: validation.errors // Include errors to inform frontend
    });
  } catch (err) {
    next(err);
  }
});

// UPDATE invoice
router.put('/:id', requirePermission('invoices.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;
    
    // Load existing invoice
    const { data: existing, error: existingError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();
      
    if (existingError || !existing) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    
    if (['approved', 'paid', 'cancelled'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: 'Cannot edit an invoice in this status' });
    }

    // Run Validation
    const validation = await validateInvoicePayload(req.body, { isUpdate: true, currentInvoiceId: id });
    const validationStatus = validation.isValid ? 'passed' : 'failed';
    const { subtotal, discount_amount, tax_amount, grand_total } = validation.calculatedTotals;

    // Keep balance_due consistent with the recalculated grand total.
    const paidSoFar = Number(existing.paid_amount) || 0;
    const newBalance = Math.round((grand_total - paidSoFar) * 100) / 100;

    // Atomic update via update_invoice_with_items RPC (phase 8).
    const invoicePatch = {
      invoice_number:    req.body.invoice_number   !== undefined ? req.body.invoice_number   : undefined,
      customer_id:       req.body.customer_id      !== undefined ? req.body.customer_id      : undefined,
      vendor_id:         req.body.vendor_id        !== undefined ? req.body.vendor_id        : undefined,
      customer_name:     req.body.customer_name    !== undefined ? req.body.customer_name    : undefined,
      customer_email:    req.body.customer_email   !== undefined ? req.body.customer_email   : undefined,
      customer_phone:    req.body.customer_phone   !== undefined ? req.body.customer_phone   : undefined,
      billing_address:   req.body.billing_address  !== undefined ? req.body.billing_address  : undefined,
      invoice_date:      req.body.invoice_date     !== undefined ? req.body.invoice_date     : undefined,
      due_date:          req.body.due_date         !== undefined ? req.body.due_date         : undefined,
      notes:             req.body.notes            !== undefined ? req.body.notes            : undefined,
      terms:             req.body.terms            !== undefined ? req.body.terms            : undefined,
      status:            req.body.status && ['draft', 'needs_review', 'sent'].includes(req.body.status) ? req.body.status : undefined,
      validation_status: validationStatus,
      validation_errors: validation.errors,
      validation_warnings: validation.warnings,
      subtotal,
      discount: discount_amount,
      tax_amount,
      grand_total,
      balance_due: newBalance,
      updated_by: userId
    };

    const { data: updateResult, error: updateRpcError } = await supabase.rpc('update_invoice_with_items', {
      invoice_id_input: id,
      invoice_input: invoicePatch,
      items_input: req.body.items ? validation.normalizedItems : null
    });
    if (updateRpcError) throw updateRpcError;
    if (!updateResult || !updateResult.success) {
      return res.status(400).json(updateResult || { success: false, message: 'Update failed' });
    }
    const { data: invoice } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();

    // Audit Log
    await createAuditLog({
      userId,
      action: 'invoice_updated',
      entityType: 'invoice',
      entityId: invoice.id,
      oldData: existing,
      newData: invoice,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      data: invoice,
      warnings: validation.warnings,
      errors: validation.errors
    });
  } catch (err) {
    next(err);
  }
});

// VALIDATE invoice API
router.post('/:id/validate', requirePermission('invoices.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;

    // Load invoice and items
    const { data: existing, error: existingError } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', id)
      .single();
      
    if (existingError || !existing) return res.status(404).json({ success: false, message: 'Invoice not found' });

    // Payload for validation is the current state
    const payload = {
      ...existing,
      items: existing.invoice_items
    };

    const validation = await validateInvoicePayload(payload, { isUpdate: true, currentInvoiceId: id });
    const validationStatus = validation.isValid ? 'passed' : 'failed';

    // Update invoice validation fields
    await supabase.from('invoices').update({
      validation_status: validationStatus,
      validation_errors: validation.errors,
      validation_warnings: validation.warnings,
      validated_at: new Date().toISOString(),
      updated_by: userId
    }).eq('id', id);

    // Insert validation log
    await supabase.from('invoice_validation_logs').insert([{
      invoice_id: id,
      validation_type: 'manual_validation',
      status: validationStatus,
      message: validation.isValid ? 'Validation passed' : 'Validation failed with errors',
      details: { errors: validation.errors, warnings: validation.warnings }
    }]);

    res.json({
      success: validation.isValid,
      message: validation.isValid ? 'Validation passed' : 'Validation failed',
      errors: validation.errors,
      warnings: validation.warnings
    });
  } catch (err) {
    next(err);
  }
});

// SUBMIT invoice
router.post('/:id/submit', requirePermission('invoices.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;

    // Load invoice
    const { data: existing, error: existingError } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', id)
      .single();
      
    if (existingError || !existing) return res.status(404).json({ success: false, message: 'Invoice not found' });
    
    if (!['draft', 'needs_review'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: 'Only draft or needs_review invoices can be submitted' });
    }

    const payload = {
      ...existing,
      items: existing.invoice_items
    };

    const validation = await validateInvoicePayload(payload, { isUpdate: true, currentInvoiceId: id });

    if (!validation.isValid) {
      // Failed to submit
      await supabase.from('invoices').update({
        status: 'needs_review',
        validation_status: 'failed',
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
        validated_at: new Date().toISOString()
      }).eq('id', id);

      await createAuditLog({
        userId,
        action: 'invoice_validation_failed',
        entityType: 'invoice',
        entityId: id,
        oldData: { status: existing.status },
        newData: { status: 'needs_review', errors: validation.errors },
        ipAddress: req.ip
      });

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // Valid -> Submit
    const { data: updated, error: updateError } = await supabase.from('invoices').update({
      status: 'submitted',
      validation_status: 'passed',
      validation_errors: [],
      validation_warnings: validation.warnings,
      validated_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
      updated_by: userId
    }).eq('id', id).select().single();

    if (updateError) throw updateError;

    // Audit Log
    await createAuditLog({
      userId,
      action: 'invoice_submitted',
      entityType: 'invoice',
      entityId: id,
      oldData: existing,
      newData: updated,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      data: updated,
      warnings: validation.warnings
    });
  } catch (err) {
    next(err);
  }
});

// STOCK CHECK
router.get('/:id/stock-check', requirePermission('invoices.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', id)
      .single();
      
    if (invoiceError || !invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    // Batch-load stock for every product on the invoice (was N+1 before).
    const productIds = Array.from(
      new Set(invoice.invoice_items.map((it) => it.product_id).filter(Boolean))
    );
    const stockById = new Map();
    if (productIds.length > 0) {
      const { data: products, error: pErr } = await supabase
        .from('products').select('id, stock').in('id', productIds);
      if (pErr) throw pErr;
      for (const p of products || []) stockById.set(p.id, p.stock);
    }

    let can_fulfill_all = true;
    const itemsResult = [];

    for (const item of invoice.invoice_items) {
      if (!item.product_id) continue;
      const available = stockById.has(item.product_id) ? stockById.get(item.product_id) : 0;
      const required = item.quantity;
      const can_fulfill = available >= required;
      if (!can_fulfill) can_fulfill_all = false;
      itemsResult.push({
        invoice_item_id: item.id,
        product_id: item.product_id,
        required_quantity: required,
        available_stock: available,
        can_fulfill
      });
    }

    res.json({
      success: true,
      data: {
        invoice_id: id,
        stock_status: invoice.stock_status || 'not_reserved',
        items: itemsResult,
        can_fulfill_all
      }
    });
  } catch (err) {
    next(err);
  }
});

// RESERVE STOCK
router.post('/:id/reserve-stock', requirePermission('invoices.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;

    // Load invoice to check status
    const { data: invoice, error: invoiceError } = await supabase.from('invoices').select('status').eq('id', id).single();
    if (invoiceError || !invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const allowedStatuses = ['submitted', 'approved'];

    if (!allowedStatuses.includes(invoice.status)) {
      return res.status(400).json({
        success: false,
        message: 'Invoice must be submitted or approved to reserve stock'
      });
    }

    const { data, error } = await supabase.rpc('reserve_invoice_stock', { invoice_id_input: id, user_id_input: userId });
    if (error) throw error;
    if (!data || !data.success) {
      return res.status(400).json(data || { success: false, message: 'Stock reservation failed' });
    }

    await createAuditLog({
      userId, action: 'stock_reserved', entityType: 'invoice', entityId: id, ipAddress: req.ip
    });

    // Log movements in JS
    try {
      const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', id);
      if (items) {
        for (const item of items) {
          await supabase.from('stock_movements').insert([{
            product_id: item.product_id,
            invoice_id: id,
            invoice_item_id: item.id,
            movement_type: 'reserved',
            quantity: item.quantity,
            notes: 'Stock reserved from invoice workflow (JS)'
          }]);
        }
      }
    } catch (logErr) {
      console.error('Failed to log stock movement:', logErr);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// CONFIRM STOCK
router.post('/:id/confirm-stock', requirePermission('invoices.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;

    // Load invoice to check status
    const { data: invoice, error: invoiceError } = await supabase.from('invoices').select('status').eq('id', id).single();
    if (invoiceError || !invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    if (!['submitted', 'approved'].includes(invoice.status)) {
      return res.status(400).json({
        success: false,
        message: 'Invoice must be submitted or approved to confirm'
      });
    }

    const { data, error } = await supabase.rpc('confirm_invoice_stock', { invoice_id_input: id, user_id_input: userId });
    if (error) throw error;
    if (!data || !data.success) {
      return res.status(400).json(data || { success: false, message: 'Stock confirmation failed' });
    }

    await createAuditLog({
      userId, action: 'stock_confirmed', entityType: 'invoice', entityId: id, ipAddress: req.ip
    });

    // Log movements in JS
    try {
      const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', id);
      if (items) {
        for (const item of items) {
          await supabase.from('stock_movements').insert([{
            product_id: item.product_id,
            invoice_id: id,
            invoice_item_id: item.id,
            movement_type: 'confirmed',
            quantity: item.quantity,
            notes: 'Stock confirmed from invoice workflow (JS)'
          }]);
        }
      }
    } catch (logErr) {
      console.error('Failed to log stock movement:', logErr);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// RELEASE STOCK
router.post('/:id/release-stock', requirePermission('invoices.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;

    const { data, error } = await supabase.rpc('release_invoice_stock', { invoice_id_input: id, user_id_input: userId });
    
    if (error) throw error;
    
    if (!data.success) {
      return res.status(400).json(data);
    }

    await createAuditLog({
      userId, action: 'invoice_stock_released', entityType: 'invoice', entityId: id, ipAddress: req.ip
    });

    // Log movements in JS
    try {
      const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', id);
      if (items) {
        for (const item of items) {
          await supabase.from('stock_movements').insert([{
            product_id: item.product_id,
            invoice_id: id,
            invoice_item_id: item.id,
            movement_type: 'released',
            quantity: item.quantity,
            notes: 'Stock released from invoice workflow (JS)'
          }]);
        }
      }
    } catch (logErr) {
      console.error('Failed to log stock movement:', logErr);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// RESTORE STOCK
router.post('/:id/restore-stock', requirePermission('invoices.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;

    const { data, error } = await supabase.rpc('restore_invoice_stock', { invoice_id_input: id, user_id_input: userId });
    
    if (error) throw error;
    
    if (!data.success) {
      return res.status(400).json(data);
    }

    await createAuditLog({
      userId, action: 'invoice_stock_restored', entityType: 'invoice', entityId: id, ipAddress: req.ip
    });

    // Log movements in JS
    try {
      const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', id);
      if (items) {
        for (const item of items) {
          await supabase.from('stock_movements').insert([{
            product_id: item.product_id,
            invoice_id: id,
            invoice_item_id: item.id,
            movement_type: 'restored',
            quantity: item.quantity,
            notes: 'Stock restored from invoice workflow (JS)'
          }]);
        }
      }
    } catch (logErr) {
      console.error('Failed to log stock movement:', logErr);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// CANCEL INVOICE
// POST /:id/cancel
// Atomic via terminate_invoice RPC (phase 11) with allow_hard_delete=false.
// Stock release + backward cascade happen inside the same Postgres transaction.
router.post('/:id/cancel', requirePermission('invoices.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;

    const { data: existing } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const { data: result, error: rpcErr } = await supabase.rpc('terminate_invoice', {
      invoice_id_input: id,
      user_id_input: userId,
      allow_hard_delete: false   // /cancel never deletes
    });
    if (rpcErr) throw rpcErr;
    if (!result || !result.success) {
      return res.status(400).json(result || { success: false, message: 'Cancel failed' });
    }

    const { data: updated } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
    const cascaded = result.cascaded || null;

    await createAuditLog({
      req, action: 'invoice_cancelled', module: 'Invoices',
      entityType: 'invoice', entityId: id, oldData: existing, newData: updated,
      details: cascaded ? {
        cascaded_quotation_id: cascaded.id,
        cascaded_quotation_number: cascaded.quotation_number
      } : null
    });
    if (cascaded) {
      await createAuditLog({
        req, action: 'quotation_cascade_rejected', module: 'Quotations',
        entityType: 'quotation', entityId: cascaded.id,
        details: { reason: 'linked invoice cancelled', invoice_id: id, invoice_number: existing.invoice_number }
      });
    }

    res.json({ success: true, data: updated, cascaded });
  } catch (err) {
    next(err);
  }
});

// REQUEST APPROVAL
router.post('/:id/request-approval', requirePermission('invoices.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;

    // 1. Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found',
        detail: invoiceError ? invoiceError.message : 'Not found'
      });
    }

    // 2. Require status submitted or draft
    if (!['submitted', 'draft'].includes(invoice.status)) {
      return res.status(400).json({
        success: false,
        message: 'Invoice must be in draft or submitted status to request approval',
        detail: `Current status is ${invoice.status}`
      });
    }

    // 3. Read approval_rules
    const { data: rules, error: rulesError } = await supabase
      .from('approval_rules')
      .select('*')
      .lte('min_amount', invoice.grand_total)
      .or(`max_amount.gte.${invoice.grand_total},max_amount.is.null`)
      .eq('is_active', true)
      .order('approval_level', { ascending: true });

    if (rulesError) throw rulesError;
    if (!rules || rules.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active approval rule found for this amount',
        detail: `Grand total is ${invoice.grand_total}`
      });
    }

    const selectedRule = rules[0];

    // 4. Create invoice_approvals
    const { data: approval, error: approvalError } = await supabase
      .from('invoice_approvals')
      .insert([{
        invoice_id: id,
        approver_role: selectedRule.approver_role,
        approval_level: selectedRule.approval_level,
        status: 'pending'
      }])
      .select()
      .single();

    if (approvalError) throw approvalError;

    // 5. Update invoice
    const { data: updatedInvoice, error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'pending_approval',
        approval_status: 'pending',
        approval_level: selectedRule.approval_level,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 6. Insert approval_logs
    try {
      await supabase.from('approval_logs').insert([{
        invoice_id: id,
        approval_id: approval.id,
        action: 'approval_requested',
        action_by: userId,
        remarks: `Approval requested at level ${selectedRule.approval_level}`
      }]);
    } catch (logErr) {
      console.error('Failed to insert approval log:', logErr);
    }

    // 7. Insert audit_logs
    await createAuditLog({
      userId,
      action: 'approval_requested',
      entityType: 'invoice',
      entityId: id,
      oldData: invoice,
      newData: updatedInvoice,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Approval requested successfully',
      data: updatedInvoice
    });
  } catch (err) {
    next(err);
  }
});

// APPROVE INVOICE
router.post('/:id/approve', requirePermission('invoices.approve'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const userId = req.user ? req.user.id : null;

    // 1. Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found',
        detail: invoiceError ? invoiceError.message : 'Not found'
      });
    }

    // 2. Require status pending_approval
    if (invoice.status !== 'pending_approval') {
      return res.status(400).json({
        success: false,
        message: 'Only invoices pending approval can be approved',
        detail: `Current status is ${invoice.status}`
      });
    }

    // 3. Find pending approval row
    const { data: pendingApproval, error: pendingError } = await supabase
      .from('invoice_approvals')
      .select('*')
      .eq('invoice_id', id)
      .eq('status', 'pending')
      .single();

    if (pendingError || !pendingApproval) {
      return res.status(400).json({
        success: false,
        message: 'No pending approval record found',
        detail: pendingError ? pendingError.message : 'Not found'
      });
    }

    // 4. Update invoice_approvals
    await supabase
      .from('invoice_approvals')
      .update({
        status: 'approved',
        remarks: remarks || 'Approved',
        approved_at: new Date().toISOString()
      })
      .eq('id', pendingApproval.id);

    // 5. Update invoice
    const { data: updatedInvoice, error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'approved',
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 6. Insert approval_logs
    try {
      await supabase.from('approval_logs').insert([{
        invoice_id: id,
        approval_id: pendingApproval.id,
        action: 'approved',
        action_by: userId,
        remarks: remarks || 'Approved'
      }]);
    } catch (logErr) {
      console.error('Failed to insert approval log:', logErr);
    }

    // 7. Insert audit_logs
    await createAuditLog({
      userId,
      action: 'invoice_approved',
      entityType: 'invoice',
      entityId: id,
      oldData: invoice,
      newData: updatedInvoice,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Invoice approved successfully',
      data: updatedInvoice
    });
  } catch (err) {
    next(err);
  }
});

// REJECT INVOICE
router.post('/:id/reject', requirePermission('invoices.approve'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const userId = req.user ? req.user.id : null;

    // 1. Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found',
        detail: invoiceError ? invoiceError.message : 'Not found'
      });
    }

    // 2. Require status pending_approval
    if (invoice.status !== 'pending_approval') {
      return res.status(400).json({
        success: false,
        message: 'Only invoices pending approval can be rejected',
        detail: `Current status is ${invoice.status}`
      });
    }

    // 3. Find pending approval row
    const { data: pendingApproval, error: pendingError } = await supabase
      .from('invoice_approvals')
      .select('*')
      .eq('invoice_id', id)
      .eq('status', 'pending')
      .single();

    if (pendingError || !pendingApproval) {
      return res.status(400).json({
        success: false,
        message: 'No pending approval record found',
        detail: pendingError ? pendingError.message : 'Not found'
      });
    }

    // 4. Update invoice_approvals
    await supabase
      .from('invoice_approvals')
      .update({
        status: 'rejected',
        remarks: remarks || 'Rejected',
        rejected_at: new Date().toISOString()
      })
      .eq('id', pendingApproval.id);

    // 5. Update invoice
    const { data: updatedInvoice, error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'rejected',
        approval_status: 'rejected',
        rejection_reason: remarks || 'Rejected',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 6. Insert approval_logs
    try {
      await supabase.from('approval_logs').insert([{
        invoice_id: id,
        approval_id: pendingApproval.id,
        action: 'rejected',
        action_by: userId,
        remarks: remarks || 'Rejected'
      }]);
    } catch (logErr) {
      console.error('Failed to insert approval log:', logErr);
    }

    // 7. Insert audit_logs
    await createAuditLog({
      userId,
      action: 'invoice_rejected',
      entityType: 'invoice',
      entityId: id,
      oldData: invoice,
      newData: updatedInvoice,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Invoice rejected successfully',
      data: updatedInvoice
    });
  } catch (err) {
    next(err);
  }
});

// DELETE / CANCEL invoice
// Drafts with no payments are hard-deleted; anything else is cancelled so
// the financial trail is preserved.
router.delete('/:id', requirePermission('invoices.delete'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;

    const { data: existing } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ success: false, message: 'Invoice not found' });

    // Atomic via terminate_invoice RPC (phase 11). The RPC handles:
    //   * draft + no payments + allow_hard_delete -> DELETE
    //   * else -> UPDATE status='cancelled'
    //   * released held stock if any
    //   * backward cascade upstream quotation 'converted' -> 'rejected'
    // All in one Postgres transaction.
    const { data: result, error: rpcErr } = await supabase.rpc('terminate_invoice', {
      invoice_id_input: req.params.id,
      user_id_input: userId,
      allow_hard_delete: true
    });
    if (rpcErr) throw rpcErr;
    if (!result || !result.success) {
      // RPC returns 'paid' / 'cancelled' / stock-failure messages structured.
      const code = (result && /aborted/.test(result.message || '')) ? 409 : 400;
      return res.status(code).json(result || { success: false, message: 'Delete failed' });
    }

    const cascaded = result.cascaded || null;
    const updated = result.hard_deleted
      ? null
      : (await supabase.from('invoices').select('*').eq('id', req.params.id).maybeSingle()).data;

    await createAuditLog({
      req,
      action: result.hard_deleted ? 'invoice_deleted' : 'invoice_cancelled',
      module: 'Invoices',
      entityType: 'invoice', entityId: existing.id,
      oldData: existing, newData: updated,
      details: cascaded ? {
        cascaded_quotation_id: cascaded.id,
        cascaded_quotation_number: cascaded.quotation_number
      } : null
    });
    if (cascaded) {
      await createAuditLog({
        req, action: 'quotation_cascade_rejected', module: 'Quotations',
        entityType: 'quotation', entityId: cascaded.id,
        details: {
          reason: result.hard_deleted ? 'linked invoice deleted' : 'linked invoice cancelled',
          invoice_id: existing.id,
          invoice_number: existing.invoice_number
        }
      });
    }

    res.json({
      success: true,
      message: result.hard_deleted ? 'Invoice deleted' : 'Invoice cancelled',
      data: updated,
      deleted: result.hard_deleted,
      cascaded
    });
  } catch (err) {
    next(err);
  }
});

// SEND invoice by email (also marks a draft as "sent")
router.post('/:id/send', requirePermission('invoices.send'), async (req, res, next) => {
  try {
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!invoice.customer_email) {
      return res.status(400).json({ success: false, message: 'Invoice has no customer email address' });
    }

    const { data: company } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();

    // The customer-facing artefact MUST exist before we touch state — better
    // to fail loudly than send a body-only email.
    let pdfBuffer;
    try {
      pdfBuffer = await generateInvoicePdf(invoice, invoice.invoice_items || [], company || {});
    } catch (pdfErr) {
      console.error('Invoice PDF generation failed:', pdfErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate the invoice PDF. The invoice was not sent.',
        detail: pdfErr.message
      });
    }

    const emailResult = await sendInvoiceEmail(invoice, pdfBuffer);

    // Advance status only when the email actually went out. Skipped (no
    // Resend key) and failed deliveries leave the source state alone so the
    // user can retry once email is fixed.
    let updated = invoice;
    if (emailResult.success) {
      const patch = {};
      if (['draft', 'needs_review', 'submitted'].includes(invoice.status)) patch.status = 'sent';
      if (!invoice.sent_at) patch.sent_at = new Date().toISOString();
      if (Object.keys(patch).length > 0) {
        const { data: u, error: upErr } = await supabase
          .from('invoices').update(patch).eq('id', invoice.id).select().single();
        if (upErr) console.error('Failed to mark invoice as sent:', upErr.message);
        if (u) updated = u;
      }
    }

    await createAuditLog({
      req,
      action: emailResult.success
        ? 'invoice_sent'
        : (emailResult.skipped ? 'invoice_send_skipped' : 'invoice_send_failed'),
      module: 'Invoices',
      entityType: 'invoice', entityId: invoice.id,
      details: { to: invoice.customer_email, email_status: emailResult }
    });

    const status = emailResult.success ? 200 : (emailResult.skipped ? 200 : 502);
    res.status(status).json({
      success: !!emailResult.success,
      skipped: !!emailResult.skipped,
      message: emailResult.success
        ? 'Invoice sent successfully'
        : (emailResult.skipped
          ? 'Email skipped: RESEND_API_KEY not configured. Configure the key and retry to send.'
          : `Email delivery failed: ${emailResult.message || 'unknown error'}`),
      data: updated,
      email: emailResult
    });
  } catch (err) {
    next(err);
  }
});

// DOWNLOAD invoice as PDF
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const { data: company } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();
    const pdfBuffer = await generateInvoicePdf(invoice, invoice.invoice_items || [], company || {});

    await createAuditLog({
      req, action: 'invoice_downloaded', module: 'Invoices',
      entityType: 'invoice', entityId: invoice.id
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number || 'invoice'}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// SEND overdue reminder
router.post('/:id/send-reminder', requirePermission('invoices.send'), async (req, res, next) => {
  try {
    const { data: invoice, error } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).single();

    if (error || !invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!invoice.customer_email) {
      return res.status(400).json({ success: false, message: 'Invoice has no customer email address' });
    }

    const emailResult = await sendOverdueReminderEmail(invoice);

    await createAuditLog({
      req, action: 'invoice_reminder_sent', module: 'Invoices',
      entityType: 'invoice', entityId: invoice.id, details: { email_status: emailResult }
    });

    res.json({
      success: emailResult.success !== false,
      message: emailResult.message || 'Reminder sent',
      email: emailResult
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
