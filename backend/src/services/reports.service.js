const supabase = require("../config/supabase");
const { sanitizeSearch } = require("../utils/escape");

// Reporting layer. Aggregations live in Postgres functions (phase 8) so we
// don't pull every invoice/payment row into Node memory. The two list-style
// reports (invoices, payments) still fetch rows directly because the page
// needs them to render — capped + filtered.

const num = (n) => Number(n || 0);
const round2 = (n) => Math.round(num(n) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

function isOverdue(inv) {
  if (!inv.due_date) return false;
  if (["paid", "cancelled"].includes(inv.status)) return false;
  return inv.due_date < today() && num(inv.balance_due) > 0.01;
}

// --- list-style fetches (rows go to the UI) -------------------------

const LIST_LIMIT = 1000; // hard ceiling so a 100k-row table can't OOM us

async function fetchInvoices(filters = {}) {
  let q = supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (filters.dateFrom) q = q.gte("invoice_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("invoice_date", filters.dateTo);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.customer) {
    const c = sanitizeSearch(filters.customer);
    if (c) q = q.ilike("customer_name", `%${c}%`);
  }
  if (filters.createdBy) q = q.eq("created_by", filters.createdBy);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchPayments(filters = {}) {
  let q = supabase
    .from("payments")
    .select("*, invoices(invoice_number, customer_name)")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (filters.dateFrom) q = q.gte("payment_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("payment_date", filters.dateTo);
  if (filters.paymentMethod) q = q.eq("payment_method", filters.paymentMethod);
  if (filters.createdBy) q = q.eq("created_by", filters.createdBy);
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
  to_input: filters.dateTo || null,
});

// --- reports ---------------------------------------------------------

async function getSummary(filters = {}) {
  // report_summary returns a single jsonb with every KPI.
  return await callRpc("report_summary", {
    from_input: filters.dateFrom || null,
    to_input: filters.dateTo || null,
    customer_input: filters.customer ? sanitizeSearch(filters.customer) : null,
    status_input: filters.status || null,
  });
}

async function getRevenueReport(filters = {}) {
  const rows = await callRpc("report_revenue_monthly", rpcArgs(filters));
  const monthly = (rows || []).map((r) => ({
    month: r.month,
    revenue: Number(r.revenue) || 0,
  }));
  return {
    monthly,
    total_revenue: round2(monthly.reduce((s, m) => s + m.revenue, 0)),
  };
}

async function getInvoiceReport(filters = {}) {
  // The list itself stays in JS so we can return rows for the UI table,
  // but by_status + aging are SQL-aggregated.
  const [invoices, aging] = await Promise.all([
    fetchInvoices(filters),
    callRpc("report_invoice_aging", rpcArgs(filters)),
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
      status,
      count: v.count,
      amount: round2(v.amount),
    })),
    aging: (aging || []).map((b) => ({
      bucket: b.bucket,
      count: Number(b.count) || 0,
      amount: Number(b.amount) || 0,
    })),
  };
}

async function getPaymentReport(filters = {}) {
  const [payments, byMethod] = await Promise.all([
    fetchPayments(filters),
    callRpc("report_payment_methods", rpcArgs(filters)),
  ]);

  return {
    payments,
    by_method: (byMethod || []).map((m) => ({
      method: m.method,
      count: Number(m.count) || 0,
      amount: Number(m.amount) || 0,
    })),
    total: round2(
      (byMethod || []).reduce((s, m) => s + (Number(m.amount) || 0), 0),
    ),
  };
}

async function getCustomerRevenue(filters = {}) {
  const rows = await callRpc("report_customer_revenue", {
    from_input: filters.dateFrom || null,
    to_input: filters.dateTo || null,
    status_input: filters.status || null,
  });
  return (rows || []).map((r) => ({
    customer: r.customer,
    invoice_count: Number(r.invoice_count) || 0,
    invoiced: Number(r.invoiced) || 0,
    paid: Number(r.paid) || 0,
    balance: Number(r.balance) || 0,
  }));
}

async function getTaxSummary(filters = {}) {
  const rows = await callRpc("report_tax_monthly", rpcArgs(filters));
  const by_month = (rows || []).map((r) => ({
    month: r.month,
    subtotal: Number(r.subtotal) || 0,
    discount: Number(r.discount) || 0,
    tax: Number(r.tax) || 0,
    total: Number(r.total) || 0,
  }));
  const sum = (k) => round2(by_month.reduce((s, r) => s + r[k], 0));
  return {
    total_subtotal: sum("subtotal"),
    total_discount: sum("discount"),
    total_tax: sum("tax"),
    total_amount: sum("total"),
    by_month,
  };
}

// --- inventory ------------------------------------------------------

async function getInventoryReport() {
  // Pull every product once and aggregate in JS — products is small enough
  // (< 5k typical) that this is fine and easier than another SQL function.
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, sku, category, unit, cost, price, tax_rate, stock, reorder_level, is_active",
    )
    .limit(5000);
  if (error) throw error;
  const products = data || [];

  const active = products.filter((p) => p.is_active !== false);
  const stockValueCost = active.reduce(
    (s, p) => s + (Number(p.cost) || 0) * (Number(p.stock) || 0),
    0,
  );
  const stockValueRetail = active.reduce(
    (s, p) => s + (Number(p.price) || 0) * (Number(p.stock) || 0),
    0,
  );
  const totalUnits = active.reduce((s, p) => s + (Number(p.stock) || 0), 0);

  // Definition: "needs attention" = out of stock OR at/below reorder threshold.
  // Out-of-stock is always flagged regardless of whether a reorder level was set.
  const outOfStock = active.filter((p) => (Number(p.stock) || 0) <= 0);
  const lowStockOnly = active.filter((p) => {
    const stock = Number(p.stock) || 0;
    const reorder = Number(p.reorder_level) || 0;
    return stock > 0 && reorder > 0 && stock <= reorder;
  });
  // Combined alert list = out-of-stock first (most urgent), then below-reorder.
  const lowStock = [...outOfStock, ...lowStockOnly];

  // By category
  const byCat = {};
  for (const p of active) {
    const k = p.category || "Uncategorized";
    byCat[k] = byCat[k] || { count: 0, units: 0, value: 0 };
    byCat[k].count += 1;
    byCat[k].units += Number(p.stock) || 0;
    byCat[k].value += (Number(p.cost) || 0) * (Number(p.stock) || 0);
  }
  const categories = Object.entries(byCat)
    .map(([category, v]) => ({
      category,
      count: v.count,
      units: v.units,
      value: round2(v.value),
    }))
    .sort((a, b) => b.value - a.value);

  // Top products by stock value
  const topByValue = active
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      stock: Number(p.stock) || 0,
      cost: Number(p.cost) || 0,
      value: round2((Number(p.cost) || 0) * (Number(p.stock) || 0)),
    }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return {
    product_count: products.length,
    active_count: active.length,
    inactive_count: products.length - active.length,
    total_units: totalUnits,
    stock_value_cost: round2(stockValueCost),
    stock_value_retail: round2(stockValueRetail),
    low_stock_count: lowStock.length,
    out_of_stock_count: outOfStock.length,
    low_stock_products: lowStock
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        stock: Number(p.stock) || 0,
        reorder_level: Number(p.reorder_level) || 0,
      }))
      .slice(0, 10),
    categories,
    top_products_by_value: topByValue,
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
  getTaxSummary,
  getInventoryReport,
};
