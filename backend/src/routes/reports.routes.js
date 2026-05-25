const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth.middleware');
const { createAuditLog } = require('../services/audit.service');
const { toCsv } = require('../utils/csv');
const { generateTablePdf } = require('../services/pdf.service');
const reports = require('../services/reports.service');

router.use(optionalAuth);

function parseFilters(q) {
  return {
    dateFrom: q.from || null,
    dateTo: q.to || null,
    customer: q.customer || null,
    status: q.status || null,
    paymentMethod: q.payment_method || null,
    createdBy: q.created_by || null
  };
}

const logView = (req, name) =>
  createAuditLog({ req, action: 'report_viewed', module: 'Reports', details: { report: name, filters: req.query } });

// GET /reports/summary  -- headline KPIs
router.get('/summary', async (req, res, next) => {
  try {
    const data = await reports.getSummary(parseFilters(req.query));
    await logView(req, 'summary');
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Note: the dashboard fires /summary AND every panel endpoint below on a
// single page load. We only audit /summary (one row per dashboard view) and
// /export (real user intent). Logging every panel call was spamming
// audit_logs with 6 identical entries per render.

// GET /reports/revenue  -- total + monthly revenue
router.get('/revenue', async (req, res, next) => {
  try {
    const data = await reports.getRevenueReport(parseFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /reports/invoices  -- invoice list + status breakdown + aging
router.get('/invoices', async (req, res, next) => {
  try {
    const data = await reports.getInvoiceReport(parseFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /reports/payments  -- payment list + method summary
router.get('/payments', async (req, res, next) => {
  try {
    const data = await reports.getPaymentReport(parseFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /reports/customers  -- customer-wise revenue
router.get('/customers', async (req, res, next) => {
  try {
    const data = await reports.getCustomerRevenue(parseFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /reports/tax  -- tax summary
router.get('/tax', async (req, res, next) => {
  try {
    const data = await reports.getTaxSummary(parseFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /reports/inventory  -- stock value, low-stock count, by-category
router.get('/inventory', async (req, res, next) => {
  try {
    const data = await reports.getInventoryReport(parseFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /reports/export?type=...&format=csv|pdf
router.get('/export', async (req, res, next) => {
  try {
    const filters = parseFilters(req.query);
    const type = (req.query.type || 'summary').toLowerCase();
    const format = (req.query.format || 'csv').toLowerCase();

    let title = 'Report';
    let columns = [];
    let rows = [];

    if (type === 'summary') {
      const s = await reports.getSummary(filters);
      title = 'Summary Report';
      columns = [{ label: 'Metric', value: 'metric' }, { label: 'Value', value: 'value' }];
      rows = [
        { metric: 'Total Revenue', value: s.total_revenue },
        { metric: 'Total Invoiced', value: s.total_invoiced },
        { metric: 'Total Outstanding', value: s.total_outstanding },
        { metric: 'Total Tax', value: s.total_tax },
        { metric: 'Invoices', value: s.invoice_counts.total },
        { metric: 'Paid Invoices', value: s.invoice_counts.paid },
        { metric: 'Pending Invoices', value: s.invoice_counts.pending },
        { metric: 'Overdue Invoices', value: s.invoice_counts.overdue },
        { metric: 'Partial Payments', value: s.invoice_counts.partially_paid }
      ];
    } else if (type === 'revenue') {
      const r = await reports.getRevenueReport(filters);
      title = 'Monthly Revenue Report';
      columns = [{ label: 'Month', value: 'month' }, { label: 'Revenue', value: 'revenue' }];
      rows = r.monthly;
    } else if (type === 'invoices') {
      const r = await reports.getInvoiceReport(filters);
      title = 'Invoices Report';
      columns = [
        { label: 'Invoice', value: 'invoice_number' },
        { label: 'Customer', value: 'customer_name' },
        { label: 'Date', value: 'invoice_date' },
        { label: 'Due Date', value: 'due_date' },
        { label: 'Status', value: 'status' },
        { label: 'Total', value: 'grand_total' },
        { label: 'Paid', value: 'paid_amount' },
        { label: 'Balance', value: 'balance_due' }
      ];
      rows = r.invoices;
    } else if (type === 'payments') {
      const r = await reports.getPaymentReport(filters);
      title = 'Payments Report';
      columns = [
        { label: 'Payment', value: 'payment_number' },
        { label: 'Invoice', value: (x) => x.invoices && x.invoices.invoice_number },
        { label: 'Customer', value: (x) => x.invoices && x.invoices.customer_name },
        { label: 'Amount', value: 'amount' },
        { label: 'Method', value: 'payment_method' },
        { label: 'Date', value: 'payment_date' }
      ];
      rows = r.payments;
    } else if (type === 'customers') {
      title = 'Customer Revenue Report';
      columns = [
        { label: 'Customer', value: 'customer' },
        { label: 'Invoices', value: 'invoice_count' },
        { label: 'Invoiced', value: 'invoiced' },
        { label: 'Paid', value: 'paid' },
        { label: 'Balance', value: 'balance' }
      ];
      rows = await reports.getCustomerRevenue(filters);
    } else if (type === 'tax') {
      const r = await reports.getTaxSummary(filters);
      title = 'Tax Summary Report';
      columns = [
        { label: 'Month', value: 'month' },
        { label: 'Subtotal', value: 'subtotal' },
        { label: 'Discount', value: 'discount' },
        { label: 'Tax', value: 'tax' },
        { label: 'Total', value: 'total' }
      ];
      rows = r.by_month;
    } else if (type === 'aging') {
      const r = await reports.getInvoiceReport(filters);
      title = 'Invoice Aging Report';
      columns = [
        { label: 'Bucket', value: 'bucket' },
        { label: 'Invoices', value: 'count' },
        { label: 'Outstanding', value: 'amount' }
      ];
      rows = r.aging;
    } else {
      return res.status(400).json({ success: false, message: `Unknown report type: ${type}` });
    }

    await createAuditLog({
      req, action: 'report_exported', module: 'Reports',
      details: { type, format, rows: rows.length }
    });

    if (format === 'pdf') {
      const pdf = await generateTablePdf(title, columns, rows);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-report.pdf"`);
      return res.send(pdf);
    }

    const csv = toCsv(rows, columns.map((c) => ({ label: c.label, value: c.value })));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
