const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { optionalAuth, requirePermission } = require('../middleware/auth.middleware');
const { createAuditLog } = require('../services/audit.service');
const { generateInvoicePdf } = require('../services/pdf.service');
const { sendInvoiceEmail, sendPaymentReceiptEmail, isConfigured } = require('../services/email.service');

router.use(optionalAuth);

// GET /email/logs  -- delivery history
router.get('/logs', async (req, res, next) => {
  try {
    const { record_id, status, email_type } = req.query;
    let q = supabase.from('email_logs').select('*').order('created_at', { ascending: false }).limit(500);
    if (record_id) q = q.eq('record_id', record_id);
    if (status) q = q.eq('status', status);
    if (email_type) q = q.eq('email_type', email_type);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, configured: isConfigured(), data });
  } catch (err) {
    next(err);
  }
});

// POST /email/send-invoice  -- body: { invoice_id }
router.post('/send-invoice', requirePermission('invoices.send'), async (req, res, next) => {
  try {
    const { invoice_id } = req.body;
    if (!invoice_id) return res.status(400).json({ success: false, message: 'invoice_id is required' });

    const { data: invoice, error } = await supabase
      .from('invoices').select('*, invoice_items(*)').eq('id', invoice_id).single();
    if (error || !invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!invoice.customer_email) {
      return res.status(400).json({ success: false, message: 'Invoice has no customer email address' });
    }

    const { data: company } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();

    let pdfBuffer;
    try {
      pdfBuffer = await generateInvoicePdf(invoice, invoice.invoice_items || [], company || {});
    } catch (pdfErr) {
      console.error('PDF generation failed:', pdfErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate the invoice PDF. The email was not sent.',
        detail: pdfErr.message
      });
    }

    const result = await sendInvoiceEmail(invoice, pdfBuffer);

    await createAuditLog({
      req,
      action: result.success
        ? 'invoice_email_sent'
        : (result.skipped ? 'invoice_email_skipped' : 'invoice_email_failed'),
      module: 'Invoices',
      entityType: 'invoice', entityId: invoice.id,
      details: { email_status: result }
    });

    const status = result.success ? 200 : (result.skipped ? 200 : 502);
    res.status(status).json({
      success: !!result.success,
      skipped: !!result.skipped,
      message: result.message || (result.success ? 'Invoice email sent' : 'Email delivery failed'),
      email: result
    });
  } catch (err) {
    next(err);
  }
});

// POST /email/send-receipt  -- body: { payment_id }
router.post('/send-receipt', requirePermission('payments.update'), async (req, res, next) => {
  try {
    const { payment_id } = req.body;
    if (!payment_id) return res.status(400).json({ success: false, message: 'payment_id is required' });

    const { data: payment, error } = await supabase
      .from('payments').select('*, invoices(*)').eq('id', payment_id).single();
    if (error || !payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    const invoice = payment.invoices;
    if (!invoice) return res.status(404).json({ success: false, message: 'Linked invoice not found' });
    if (!invoice.customer_email) {
      return res.status(400).json({ success: false, message: 'Invoice has no customer email address' });
    }

    const result = await sendPaymentReceiptEmail(invoice, payment);

    await createAuditLog({
      req,
      action: result.success
        ? 'payment_receipt_email_sent'
        : (result.skipped ? 'payment_receipt_email_skipped' : 'payment_receipt_email_failed'),
      module: 'Payments',
      entityType: 'payment', entityId: payment.id,
      details: { email_status: result }
    });

    const status = result.success ? 200 : (result.skipped ? 200 : 502);
    res.status(status).json({
      success: !!result.success,
      skipped: !!result.skipped,
      message: result.message || (result.success ? 'Receipt email sent' : 'Email delivery failed'),
      email: result
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
