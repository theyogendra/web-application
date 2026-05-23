const supabase = require('../config/supabase');
const { sanitizeSearch } = require('../utils/escape');

// Reporting layer. Aggregations live in Postgres functions (phase 8) so we
// don't pull every invoice/payment row into Node memory. The two list-style
// reports (invoices, payments) still fetch rows directly because the page
// needs them to render — capped + filtered.

const num = (n) => Number(n || 0);
const round2 = (n) => Math.round(num(n) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

function isOverdue(inv) {
  if (!inv.due_date) return false;
  if (['paid', 'cancelled'].includes(inv.status)) return false;
  return inv.due_date < today() && num(inv.balance_due) > 0.01;
}

// --- list-style fetches (rows go to the UI) -------------------------

const LIST_LIMIT = 1000;  // hard ceiling so a 100k-row table can't OOM us

async function fetchInvoices(filters = {}) {
  let q = supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(LIST_LIMIT);
  if (filters.dateFrom) q = q.gte('invoice_date', filters.dateFrom);
  if (filters.dateTo) q = q.lte('invoice_date', filters.dateTo);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.customer) {
    const c = sanitizeSearch(filters.customer);
    if (c) q = q.ilike('customer_name', `%${c}%`);
  }
  if (filters.createdBy) q = q.eq('created_by', filters.createdBy);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchPayments(filters = {}) {
  let q = supabase
    .from('payments')
    .select('*, invoices(invoice_number, customer_name)')
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (filters.dateFrom) q = q.gte('payment_date', filters.dateFrom);
  if (filters.dateTo) q = q.lte('payment_date', filters.dateTo);
  if (filters.paymentMethod) q = q.eq('payment_method', filters.paymentMethod);
  if (filters.createdBy) q = q.eq('created_by', filters.createdBy);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// --- helper for calling SQL aggregations ----------------------------

async function callRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

const rpcArgs = (filters) => ({
  from_input: filters.dateFrom || null,
  to_input: filters.dateTo || null
});

// --- reports ---------------------------------------------------------

async function getSummary(filters = {}) {
  // report_summary returns a single jsonb with every KPI.
  return await callRpc('report_summary', {
    from_input: filters.dateFrom || null,
    to_input: filters.dateTo || null,
    customer_input: filters.customer ? sanitizeSearch(filters.customer) : null,
    status_input: filters.status || null
  });
}

async function getRevenueReport(filters = {}) {
  const rows = await callRpc('report_revenue_monthly', rpcArgs(filters));
  const monthly = (rows || []).map((r) => ({ month: r.month, revenue: Number(r.revenue) || 0 }));
  return {
    monthly,
    total_revenue: round2(monthly.reduce((s, m) => s + m.revenue, 0))
  };
}

async function getInvoiceReport(filters = {}) {
  // The list itself stays in JS so we can return rows for the UI table,
  // but by_status + aging are SQL-aggregated.
  const [invoices, aging] = await Promise.all([
    fetchInvoices(filters),
    callRpc('report_invoice_aging', rpcArgs(filters))
  ]);

  // by_status is a tiny in-memory roll-up of the same list we already loaded.
  const byStatus = {};
  for (const i of invoices) {
    byStatus[i.status] = byStatus[i.status] || { count: 0, amount: 0 };
    byStatus[i.status].count += 1;
    byStatus[i.status].amount += num(i.grand_total);
  }

  return {
    invoices: invoices.map((i) => ({ ...i, is_overdue: isOverdue(i) })),
    by_status: Object.entries(byStatus).map(([status, v]) => ({
      status, count: v.count, amount: round2(v.amount)
    })),
    aging: (aging || []).map((b) => ({
      bucket: b.bucket,
      count: Number(b.count) || 0,
      amount: Number(b.amount) || 0
    }))
  };
}

async function getPaymentReport(filters = {}) {
  const [payments, byMethod] = await Promise.all([
    fetchPayments(filters),
    callRpc('report_payment_methods', rpcArgs(filters))
  ]);

  return {
    payments,
    by_method: (byMethod || []).map((m) => ({
      method: m.method,
      count: Number(m.count) || 0,
      amount: Number(m.amount) || 0
    })),
    total: round2((byMethod || []).reduce((s, m) => s + (Number(m.amount) || 0), 0))
  };
}

async function getCustomerRevenue(filters = {}) {
  const rows = await callRpc('report_customer_revenue', {
    from_input: filters.dateFrom || null,
    to_input: filters.dateTo || null,
    status_input: filters.status || null
  });
  return (rows || []).map((r) => ({
    customer: r.customer,
    invoice_count: Number(r.invoice_count) || 0,
    invoiced: Number(r.invoiced) || 0,
    paid: Number(r.paid) || 0,
    balance: Number(r.balance) || 0
  }));
}

async function getTaxSummary(filters = {}) {
  const rows = await callRpc('report_tax_monthly', rpcArgs(filters));
  const by_month = (rows || []).map((r) => ({
    month: r.month,
    subtotal: Number(r.subtotal) || 0,
    discount: Number(r.discount) || 0,
    tax: Number(r.tax) || 0,
    total: Number(r.total) || 0
  }));
  const sum = (k) => round2(by_month.reduce((s, r) => s + r[k], 0));
  return {
    total_subtotal: sum('subtotal'),
    total_discount: sum('discount'),
    total_tax:      sum('tax'),
    total_amount:   sum('total'),
    by_month
  };
}

module.exports = {
  isOverdue,
  fetchInvoices,
  fetchPayments,
  getSummary,
  getRevenueReport,
  getInvoiceReport,
  getPaymentReport,
  getCustomerRevenue,
  getTaxSummary
};
