const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { validateInvoicePayload } = require('../services/invoice-validation.service');
const { createAuditLog } = require('../services/audit.service');
const { requirePermission, authenticate } = require('../middleware/auth.middleware');

// GET all invoices
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, customers(name), vendors(name)')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET single invoice by id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*), customers(name, email, billing_address, gst_number), vendors(name, email, billing_address, gst_number)')
      .eq('id', req.params.id)
      .single();
      
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Invoice not found' });
    
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// CREATE invoice (Draft)
router.post('/', requirePermission('can_create_invoice'), async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    
    // Run Validation
    const validation = await validateInvoicePayload(req.body, { isUpdate: false });
    
    // Even if validation fails, for Phase 2 POST we just save the draft and warnings, unless strictly blocked.
    // The prompt says: "status remains draft, validation_status can be pending or passed depending on result"
    const validationStatus = validation.isValid ? 'passed' : 'failed';
    
    const { subtotal, discount_amount, tax_amount, grand_total } = validation.calculatedTotals;

    // Insert invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert([{
        invoice_number: req.body.invoice_number || null,
        customer_id: req.body.customer_id || null,
        vendor_id: req.body.vendor_id || null,
        status: 'draft',
        validation_status: validationStatus,
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
        subtotal,
        discount: discount_amount,
        tax_amount,
        grand_total,
        created_by: userId
      }])
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    // Insert items
    if (validation.normalizedItems.length > 0) {
      const itemsToInsert = validation.normalizedItems.map(item => ({
        ...item,
        invoice_id: invoice.id,
        validation_errors: [] // Store item specific errors if needed
      }));
      
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);
        
      if (itemsError) throw itemsError;
    }

    // Audit Log
    await createAuditLog({
      userId,
      action: 'invoice_created',
      entityType: 'invoice',
      entityId: invoice.id,
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
router.put('/:id', requirePermission('can_edit_invoice'), async (req, res, next) => {
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

    // Update invoice record
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .update({
        invoice_number: req.body.invoice_number !== undefined ? req.body.invoice_number : existing.invoice_number,
        customer_id: req.body.customer_id !== undefined ? req.body.customer_id : existing.customer_id,
        vendor_id: req.body.vendor_id !== undefined ? req.body.vendor_id : existing.vendor_id,
        status: req.body.status && ['draft', 'needs_review'].includes(req.body.status) ? req.body.status : existing.status,
        validation_status: validationStatus,
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
        subtotal,
        discount: discount_amount,
        tax_amount,
        grand_total,
        updated_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    // Replace items safely
    if (req.body.items) {
      const { error: deleteError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', id);
        
      if (deleteError) throw deleteError;

      if (validation.normalizedItems.length > 0) {
        const itemsToInsert = validation.normalizedItems.map(item => ({
          ...item,
          invoice_id: id
        }));
        
        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(itemsToInsert);
          
        if (itemsError) throw itemsError;
      }
    }

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
router.post('/:id/validate', requirePermission('can_edit_invoice'), async (req, res, next) => {
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
router.post('/:id/submit', requirePermission('can_submit_invoice'), async (req, res, next) => {
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
router.get('/:id/stock-check', requirePermission('can_edit_invoice'), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', id)
      .single();
      
    if (invoiceError || !invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    let can_fulfill_all = true;
    const itemsResult = [];

    for (const item of invoice.invoice_items) {
      if (!item.product_id) continue;
      
      const { data: product } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
      
      const available = product ? product.stock : 0;
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
router.post('/:id/reserve-stock', requirePermission('can_edit_invoice'), async (req, res, next) => {
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

    console.log(`[DEBUG] Reserve Stock hit for ID: ${id}`);
    console.log(`[DEBUG] Invoice status: ${invoice.status}`);

    const { data, error } = await supabase.rpc('reserve_invoice_stock', { invoice_id_input: id, user_id_input: userId });
    
    console.log(`[DEBUG] RPC Result:`, data);
    if (error) console.error(`[DEBUG] RPC Error:`, error);
    
    if (!data.success) {
      return res.status(400).json(data);
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
router.post('/:id/confirm-stock', requirePermission('can_submit_invoice'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;

    // Load invoice to check status
    const { data: invoice, error: invoiceError } = await supabase.from('invoices').select('status').eq('id', id).single();
    if (invoiceError || !invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    console.log(`[DEBUG] Confirm Stock hit for ID: ${id}`);
    console.log(`[DEBUG] Invoice status: ${invoice.status}`);

    if (!['submitted', 'approved'].includes(invoice.status)) {
      return res.status(400).json({
        success: false,
        message: 'Invoice must be submitted or approved to confirm'
      });
    }

    const { data, error } = await supabase.rpc('confirm_invoice_stock', { invoice_id_input: id, user_id_input: userId });
    
    console.log(`[DEBUG] RPC Result:`, data);
    if (error) console.error(`[DEBUG] RPC Error:`, error);
    
    if (error) throw error;
    
    if (!data.success) {
      return res.status(400).json(data);
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
router.post('/:id/release-stock', requirePermission('can_edit_invoice'), async (req, res, next) => {
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
router.post('/:id/restore-stock', requirePermission('can_edit_invoice'), async (req, res, next) => {
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
router.post('/:id/cancel', requirePermission('can_edit_invoice'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;

    const { data: existing, error: existingError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();
      
    if (existingError || !existing) return res.status(404).json({ success: false, message: 'Invoice not found' });
    
    if (existing.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Cannot cancel a paid invoice' });
    }

    // Handle stock
    if (existing.stock_status === 'reserved') {
      await supabase.rpc('release_invoice_stock', { invoice_id_input: id, user_id_input: userId });
    } else if (existing.stock_status === 'reduced') {
      await supabase.rpc('restore_invoice_stock', { invoice_id_input: id, user_id_input: userId });
    }

    const { data: updated, error: updateError } = await supabase.from('invoices').update({
      status: 'cancelled',
      updated_by: userId,
      updated_at: new Date().toISOString()
    }).eq('id', id).select().single();

    if (updateError) throw updateError;

    await createAuditLog({
      userId, action: 'invoice_cancelled', entityType: 'invoice', entityId: id, oldData: existing, newData: updated, ipAddress: req.ip
    });

    res.json({
      success: true,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// REQUEST APPROVAL
router.post('/:id/request-approval', requirePermission('can_submit_invoice'), async (req, res, next) => {
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
router.post('/:id/approve', requirePermission('can_approve_invoice'), async (req, res, next) => {
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
router.post('/:id/reject', requirePermission('can_approve_invoice'), async (req, res, next) => {
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

module.exports = router;
