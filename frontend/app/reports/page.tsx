"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import {
  TrendingUp,
  CircleDollarSign,
  ReceiptText,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Package,
  PackageX,
  Boxes,
  CheckCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { apiGet, downloadCsv, downloadPdf } from "@/lib/api";
import { formatCurrency, titleCase } from "@/lib/format";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
} from "@/components/ui";
import StatCard from "@/components/StatCard";
import ExportButton from "@/components/ExportButton";
import { ExportService, ExportColumn } from "@/lib/ExportService";

// ── Export dropdown menu ──────────────────────────────────────────────────────
const REPORT_TYPES = [
  { value: "invoices", label: "Invoices" },
  { value: "payments", label: "Payments" },
  { value: "customers", label: "Customers" },
  { value: "tax", label: "Tax Summary" },
  { value: "revenue", label: "Revenue" },
  { value: "summary", label: "Summary KPIs" },
];

// ─────────────────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: "#86868B",
  sent: "#0A84FF",
  partially_paid: "#FF9500",
  paid: "#34C759",
  cancelled: "#3A3A3C",
  overdue: "#FF3B30",
  accepted: "#34C759",
  rejected: "#FF3B30",
  converted: "#AF52DE",
};

const METHOD_COLORS: Record<string, string> = {
  cash: "#34C759",
  bank_transfer: "#0A84FF",
  card: "#AF52DE",
  upi: "#FF9500",
  cheque: "#5AC8FA",
  online: "#FF2D55",
};

function tooltipStyle(): React.CSSProperties {
  return {
    background: "var(--bg-elevated)",
    border: "1px solid var(--separator)",
    borderRadius: 10,
    fontSize: 12,
    padding: "8px 10px",
    boxShadow: "0 8px 24px -4px rgba(15,23,42,0.12)",
    color: "var(--text-primary)",
  };
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const [summary, setSummary] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [invoices, setInvoices] = useState<any>(null);
  const [paymentsRep, setPaymentsRep] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tax, setTax] = useState<any>(null);
  const [inventory, setInventory] = useState<any>(null);

  const [reportType, setReportType] = useState("invoices");

  const reportColumnsMap: Record<string, ExportColumn[]> = {
    summary: [
      { label: "Metric", key: "metric" },
      { label: "Value", key: "value" },
    ],
    revenue: [
      { label: "Month", key: "month" },
      { label: "Revenue", key: "revenue" },
    ],
    invoices: [
      { label: "Invoice No", key: "invoice_number" },
      { label: "Customer", key: "customer_name" },
      { label: "Date", key: "invoice_date" },
      { label: "Due Date", key: "due_date" },
      { label: "Status", key: "status" },
      { label: "Grand Total", key: "grand_total" },
      { label: "Paid", key: "paid_amount" },
      { label: "Balance", key: "balance_due" },
    ],
    payments: [
      { label: "Payment Number", key: "payment_number" },
      {
        label: "Invoice Number",
        key: "invoice_number",
        value: (x: any) => x.invoices?.invoice_number || "",
      },
      {
        label: "Customer",
        key: "customer_name",
        value: (x: any) => x.invoices?.customer_name || "",
      },
      { label: "Amount", key: "amount" },
      { label: "Method", key: "payment_method" },
      { label: "Date", key: "payment_date" },
    ],
    customers: [
      { label: "Customer", key: "customer" },
      { label: "Invoices", key: "invoice_count" },
      { label: "Invoiced", key: "invoiced" },
      { label: "Paid", key: "paid" },
      { label: "Balance", key: "balance" },
    ],
    tax: [
      { label: "Month", key: "month" },
      { label: "Subtotal", key: "subtotal" },
      { label: "Discount", key: "discount" },
      { label: "Tax", key: "tax" },
      { label: "Total", key: "total" },
    ],
  };

  const getReportData = (type: string) => {
    switch (type) {
      case "summary":
        return summary
          ? [
              { metric: "Total Revenue", value: summary.total_revenue },
              { metric: "Total Invoiced", value: summary.total_invoiced },
              { metric: "Total Outstanding", value: summary.total_outstanding },
              { metric: "Total Tax", value: summary.total_tax },
              { metric: "Invoices", value: summary.invoice_counts?.total || 0 },
              {
                metric: "Paid Invoices",
                value: summary.invoice_counts?.paid || 0,
              },
              {
                metric: "Pending Invoices",
                value: summary.invoice_counts?.pending || 0,
              },
              {
                metric: "Overdue Invoices",
                value: summary.invoice_counts?.overdue || 0,
              },
              {
                metric: "Partial Payments",
                value: summary.invoice_counts?.partially_paid || 0,
              },
            ]
          : [];
      case "revenue":
        return revenue?.monthly || [];
      case "invoices":
        return invoices?.invoices || [];
      case "payments":
        return paymentsRep?.payments || [];
      case "customers":
        return customers || [];
      case "tax":
        return tax?.by_month || [];
      default:
        return [];
    }
  };

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Primary summary fetch — renders PageHeader and top KPI strip as soon as available
      const summaryRes = await apiGet("/reports/summary").catch(() => null);
      if (summaryRes?.data) {
        setSummary(summaryRes.data);
      }
      setLoading(false);

      // Secondary reports load independently without blocking the page
      Promise.allSettled([
        apiGet("/reports/revenue"),
        apiGet("/reports/invoices"),
        apiGet("/reports/payments"),
        apiGet("/reports/customers"),
        apiGet("/reports/tax"),
        apiGet("/reports/inventory"),
      ]).then((results) => {
        const getVal = (idx: number) =>
          results[idx].status === "fulfilled"
            ? (results[idx] as PromiseFulfilledResult<any>).value?.data
            : null;

        if (getVal(0)) setRevenue(getVal(0));
        if (getVal(1)) setInvoices(getVal(1));
        if (getVal(2)) setPaymentsRep(getVal(2));
        const cust = getVal(3);
        if (cust) setCustomers(Array.isArray(cust) ? cust : []);
        if (getVal(4)) setTax(getVal(4));
        if (getVal(5)) setInventory(getVal(5));
      });
    } catch (err: any) {
      setError(err?.message || "Failed to load reports.");
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Build a 12-point trend for each KPI sparkline. Falls back to the monthly
  // revenue series for the headline cards; secondary cards get a flat trace.
  const revTrend = useMemo(() => {
    const m = revenue?.monthly || [];
    if (m.length === 0) return [0, 0];
    return m.map((p: any) => Number(p.revenue) || 0);
  }, [revenue]);

  // Derive a delta % from the last two revenue months (or NaN if not enough data).
  const revDelta = useMemo(() => {
    const series = revTrend;
    if (!Array.isArray(series) || series.length < 2) return NaN;
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    if (!isFinite(prev) || prev === 0) return NaN;
    return ((last - prev) / Math.abs(prev)) * 100;
  }, [revTrend]);

  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  /** Toast timeouts — cleared on unmount */
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, isError = false) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (isError) {
      setExportError(msg);
      setExportSuccess(null);
    } else {
      setExportSuccess(msg);
      setExportError(null);
    }
    toastTimerRef.current = setTimeout(() => {
      setExportError(null);
      setExportSuccess(null);
    }, 5000);
  }

  async function doExport(type: string, format: string) {
    const key = `${type}-${format}`;
    setExporting(key);
    setExportError(null);
    setExportSuccess(null);
    const today = new Date().toISOString().slice(0, 10);
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    const filename = `${label}_Report_${today}`;
    try {
      await ExportService.export(
        format,
        {
          title: `${label} Report`,
          filename,
          columns: reportColumnsMap[type] || [],
          data: getReportData(type),
          pdfUrl:
            format === "pdf"
              ? `/reports/export?type=${type}&format=pdf`
              : undefined,
        },
        () => {},
      );
      showToast(`${label} report exported successfully.`);
    } catch (err: any) {
      showToast(err?.message || "Export failed.", true);
    } finally {
      setExporting(null);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Reports" />
        <Loading label="Loading reports..." />
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader title="Reports" />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  const counts = summary?.invoice_counts || {};

  const statusData = (invoices?.by_status || []).map((s: any) => ({
    name: titleCase(s.status),
    value: Number(s.amount) || 0,
    count: Number(s.count) || 0,
    color: STATUS_COLORS[s.status] || "#86868B",
  }));

  const monthlyData = (revenue?.monthly || []).map((m: any) => ({
    month: m.month,
    revenue: Number(m.revenue) || 0,
  }));

  const methodData = (paymentsRep?.by_method || []).map((m: any) => ({
    name: titleCase(m.method).replace(/_/g, " "),
    amount: Number(m.amount) || 0,
    count: Number(m.count) || 0,
    color: METHOD_COLORS[m.method] || "#86868B",
  }));

  return (
    <div className="space-y-7">
      <PageHeader
        title="Reports"
        description="Revenue, invoices, payments and tax analytics."
        actions={
          <div className="flex items-center gap-3">
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="rounded-lg border border-[var(--separator-soft)] bg-[var(--bg-surface)] px-3 py-2 text-[13px] font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:bg-[#1C1C1E] dark:border-gray-800"
            >
              {REPORT_TYPES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <ExportButton
              title={`${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`}
              filename={`${reportType.charAt(0).toUpperCase() + reportType.slice(1)}_Report_${new Date().toISOString().slice(0, 10)}`}
              columns={reportColumnsMap[reportType] || []}
              data={getReportData(reportType)}
              pdfUrl={`/reports/export?type=${reportType}&format=pdf`}
              requiredPermission="reports.export"
            />
          </div>
        }
      />

      {/* Toast strip */}
      {exportError ? (
        <div className="mx-auto mb-2 flex max-w-xl items-center gap-2 rounded-xl bg-[#FF3B30]/10 px-4 py-2.5 text-[13px] font-medium text-[#C20F0F] dark:bg-[#FF453A]/15 dark:text-[#FF453A]">
          <AlertTriangle size={14} className="shrink-0" />
          {exportError}
        </div>
      ) : null}
      {exportSuccess ? (
        <div className="mx-auto mb-2 flex max-w-xl items-center gap-2 rounded-xl bg-[#34C759]/10 px-4 py-2.5 text-[13px] font-medium text-[#248A3D] dark:bg-[#30D158]/15 dark:text-[#30D158]">
          <CheckCircle size={14} className="shrink-0" />
          {exportSuccess}
        </div>
      ) : null}

      {/* Hero KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={formatCurrency(summary?.total_revenue)}
          delta={revDelta}
          deltaSuffix="vs last month"
          trend={revTrend}
          accent="blue"
          icon={<TrendingUp size={18} />}
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(summary?.total_outstanding)}
          invertDelta
          deltaSuffix="open balance"
          accent="amber"
          icon={<CircleDollarSign size={18} />}
        />
        <StatCard
          label="Paid Invoices"
          value={String(counts.paid ?? 0)}
          deltaSuffix="settled"
          accent="green"
          icon={<ReceiptText size={18} />}
        />
        <StatCard
          label="Overdue"
          value={String(counts.overdue ?? 0)}
          invertDelta
          deltaSuffix="needs attention"
          accent="red"
          icon={<AlertTriangle size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Revenue trend */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Revenue trend
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">
                  Monthly cash collected
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => doExport("revenue", "pdf")}
                >
                  <FileSpreadsheet size={13} />
                  CSV
                </Button>
              </div>
            </div>
            {monthlyData.length === 0 ? (
              <EmptyState message="No revenue data yet." />
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={monthlyData}
                    margin={{ top: 5, right: 8, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="revenueArea"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#0A84FF"
                          stopOpacity={0.32}
                        />
                        <stop
                          offset="100%"
                          stopColor="#0A84FF"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="var(--separator-soft)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        "₹" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)
                      }
                      width={48}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      formatter={(v: any) => formatCurrency(v)}
                      labelStyle={{
                        color: "var(--text-secondary)",
                        fontSize: 11,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#0A84FF"
                      strokeWidth={2}
                      fill="url(#revenueArea)"
                      animationDuration={700}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Invoice status donut */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Invoices by status
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">
                  Distribution of total invoiced
                </p>
              </div>
            </div>
            {statusData.length === 0 ? (
              <EmptyState message="No invoice data yet." />
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={56}
                      outerRadius={86}
                      paddingAngle={2}
                      stroke="var(--bg-surface)"
                      strokeWidth={3}
                      animationDuration={700}
                    >
                      {statusData.map((entry: any, idx: number) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      formatter={(v: any) => formatCurrency(v)}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{
                        fontSize: 11.5,
                        color: "var(--text-secondary)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Payment methods */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Payment methods
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">
                  Total collected by channel
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => doExport("payments", "pdf")}
              >
                <FileSpreadsheet size={13} />
                CSV
              </Button>
            </div>
            {methodData.length === 0 ? (
              <EmptyState message="No payment data yet." />
            ) : (
              (() => {
                const total = methodData.reduce(
                  (s: number, m: any) => s + (Number(m.amount) || 0),
                  0,
                );
                return (
                  <div className="space-y-3">
                    {methodData.map((m: any) => {
                      const pct =
                        total > 0 ? (Number(m.amount) / total) * 100 : 0;
                      return (
                        <div
                          key={m.name}
                          className="rounded-lg border border-[var(--separator-soft)] bg-[var(--bg-subtle)] px-3.5 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: m.color }}
                              />
                              <span className="text-[13.5px] font-medium text-[var(--text-primary)]">
                                {m.name}
                              </span>
                              <span className="ml-1 rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-tertiary)] border border-[var(--separator-soft)]">
                                {m.count} {m.count === 1 ? "txn" : "txns"}
                              </span>
                            </div>
                            <div className="text-right">
                              <p className="financial text-[14px] font-semibold text-[var(--text-primary)]">
                                {formatCurrency(m.amount)}
                              </p>
                              <p className="text-[11px] text-[var(--text-tertiary)]">
                                {pct.toFixed(1)}% of total
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-surface)]">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: m.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between border-t border-[var(--separator-soft)] pt-3">
                      <span className="text-[12px] uppercase tracking-wide text-[var(--text-tertiary)]">
                        Total collected
                      </span>
                      <span className="financial text-[15px] font-semibold text-[var(--text-primary)]">
                        {formatCurrency(total)}
                      </span>
                    </div>
                  </div>
                );
              })()
            )}
          </Card>
        </motion.div>

        {/* Aging snapshot */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
              Invoice aging
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">
              Outstanding by overdue bucket
            </p>
            <div className="mt-4 space-y-2.5">
              {(invoices?.aging || []).map((row: any) => {
                const total = (invoices?.aging || []).reduce(
                  (s: number, r: any) => s + (Number(r.amount) || 0),
                  0,
                );
                const pct =
                  total > 0 ? ((Number(row.amount) || 0) / total) * 100 : 0;
                const tone =
                  row.bucket === "90+"
                    ? "bg-[#FF3B30]"
                    : row.bucket === "61-90"
                      ? "bg-[#FF9500]"
                      : row.bucket === "31-60"
                        ? "bg-[#FF9F0A]"
                        : row.bucket === "1-30"
                          ? "bg-[#FFCC00]"
                          : "bg-[#34C759]";
                return (
                  <div key={row.bucket}>
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="text-[var(--text-secondary)]">
                        {row.bucket}
                      </span>
                      <span className="financial font-medium text-[var(--text-primary)]">
                        {formatCurrency(row.amount)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                      <motion.div
                        className={`h-full ${tone}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                );
              })}
              {(!invoices?.aging || invoices.aging.length === 0) && (
                <EmptyState message="No aging data yet." />
              )}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Inventory snapshot */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Stock value"
          value={formatCurrency(inventory?.stock_value_cost)}
          deltaSuffix="at cost"
          accent="blue"
          icon={<Boxes size={18} />}
        />
        <StatCard
          label="Retail value"
          value={formatCurrency(inventory?.stock_value_retail)}
          deltaSuffix="at selling price"
          accent="violet"
          icon={<CircleDollarSign size={18} />}
        />
        <StatCard
          label="Active products"
          value={String(inventory?.active_count ?? 0)}
          deltaSuffix={`${inventory?.total_units ?? 0} total units`}
          accent="green"
          icon={<Package size={18} />}
        />
        <StatCard
          label="Low stock"
          value={String(inventory?.low_stock_count ?? 0)}
          invertDelta
          deltaSuffix={`${inventory?.out_of_stock_count ?? 0} out of stock`}
          accent={inventory?.low_stock_count > 0 ? "red" : "neutral"}
          icon={<PackageX size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* By category */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.22 }}
        >
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Inventory by category
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">
                  Stock value distribution
                </p>
              </div>
            </div>
            {!inventory || (inventory.categories || []).length === 0 ? (
              <EmptyState message="No inventory data yet." />
            ) : (
              (() => {
                const cats = inventory.categories || [];
                const max = Math.max(
                  ...cats.map((c: any) => Number(c.value) || 0),
                  1,
                );
                return (
                  <div className="space-y-3">
                    {cats.map((c: any, i: number) => {
                      const pct = ((Number(c.value) || 0) / max) * 100;
                      return (
                        <div key={c.category}>
                          <div className="mb-1 flex items-center justify-between text-[13px]">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-[var(--text-primary)]">
                                {c.category}
                              </span>
                              <span className="rounded-full bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--text-tertiary)]">
                                {c.count} {c.count === 1 ? "item" : "items"}
                              </span>
                              <span className="text-[11px] text-[var(--text-tertiary)]">
                                {c.units} units
                              </span>
                            </div>
                            <span className="financial font-semibold text-[var(--text-primary)]">
                              {formatCurrency(c.value)}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                            <motion.div
                              className="h-full rounded-full"
                              style={{
                                background: [
                                  "#0A84FF",
                                  "#34C759",
                                  "#AF52DE",
                                  "#FF9500",
                                  "#FF2D55",
                                  "#5AC8FA",
                                ][i % 6],
                              }}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </Card>
        </motion.div>

        {/* Low stock alert */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.24 }}
        >
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Low stock
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">
                  At or below reorder level
                </p>
              </div>
              {inventory?.low_stock_count > 0 ? (
                <span className="rounded-full bg-[#FF3B30]/12 px-2 py-0.5 text-[11px] font-medium text-[#C20F0F] dark:bg-[#FF453A]/20 dark:text-[#FF453A]">
                  {inventory.low_stock_count} alert
                  {inventory.low_stock_count > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            {!inventory || (inventory.low_stock_products || []).length === 0 ? (
              <EmptyState message="No low-stock items 🎉" />
            ) : (
              <div className="space-y-2">
                {inventory.low_stock_products.map((p: any) => {
                  const stock = Number(p.stock) || 0;
                  const reorder = Number(p.reorder_level) || 0;
                  const out = stock <= 0;
                  const tone = out
                    ? {
                        border: "border-[#FF3B30]/20",
                        bg: "bg-[#FF3B30]/6",
                        text: "text-[#C20F0F] dark:text-[#FF453A]",
                        chip: "bg-[#FF3B30]/15 text-[#C20F0F] dark:bg-[#FF453A]/25 dark:text-[#FF453A]",
                        chipLabel: "Out of stock",
                      }
                    : {
                        border: "border-[#FF9500]/20",
                        bg: "bg-[#FF9500]/6",
                        text: "text-[#C77800] dark:text-[#FF9F0A]",
                        chip: "bg-[#FF9500]/15 text-[#C77800] dark:bg-[#FF9F0A]/25 dark:text-[#FF9F0A]",
                        chipLabel: "Low",
                      };
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between rounded-lg border ${tone.border} ${tone.bg} px-3 py-2`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                            {p.name}
                          </p>
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.chip}`}
                          >
                            {tone.chipLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-tertiary)]">
                          {p.sku || "—"}
                        </p>
                      </div>
                      <div className="ml-3 text-right">
                        <p className={`text-[13px] font-semibold ${tone.text}`}>
                          {stock} {p.unit || "left"}
                        </p>
                        <p className="text-[11px] text-[var(--text-tertiary)]">
                          {reorder > 0
                            ? `Reorder at ${reorder}`
                            : "No threshold set"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Top customers + Tax summary */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
        >
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Top customers
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">
                  By total paid
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => doExport("customers", "pdf")}
              >
                <FileSpreadsheet size={13} />
                CSV
              </Button>
            </div>
            {customers.length === 0 ? (
              <EmptyState message="No customer data yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--separator-soft)] text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
                      <th className="py-2 text-left font-medium">Customer</th>
                      <th className="py-2 text-right font-medium">Invoices</th>
                      <th className="py-2 text-right font-medium">Paid</th>
                      <th className="py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.slice(0, 8).map((c: any) => (
                      <tr
                        key={c.customer}
                        className="border-b border-[var(--separator-soft)] last:border-0 transition-colors hover:bg-[var(--bg-subtle)]"
                      >
                        <td className="py-2.5 font-medium text-[var(--text-primary)]">
                          {c.customer}
                        </td>
                        <td className="py-2.5 text-right text-[var(--text-secondary)]">
                          {c.invoice_count ?? 0}
                        </td>
                        <td className="financial py-2.5 text-right text-[var(--text-primary)]">
                          {formatCurrency(c.paid)}
                        </td>
                        <td className="financial py-2.5 text-right text-[var(--text-secondary)]">
                          {formatCurrency(c.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Tax summary
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">
                  GST collected to date
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => doExport("tax", "pdf")}
              >
                <FileSpreadsheet size={13} />
                CSV
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Subtotal", tax?.total_subtotal],
                ["Discount", tax?.total_discount],
                ["Tax", tax?.total_tax],
                ["Total", tax?.total_amount],
              ].map(([label, val]) => (
                <div
                  key={label as string}
                  className="rounded-xl border border-[var(--separator-soft)] bg-[var(--bg-subtle)] p-3"
                >
                  <p className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                    {label}
                  </p>
                  <p className="financial mt-1 text-[18px] font-semibold text-[var(--text-primary)]">
                    {formatCurrency(val)}
                  </p>
                </div>
              ))}
            </div>
            {tax?.by_month && tax.by_month.length > 0 && (
              <div className="mt-4 max-h-[140px] overflow-y-auto rounded-lg border border-[var(--separator-soft)]">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-[var(--bg-subtle)]">
                    <tr className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
                      <th className="px-3 py-1.5 text-left font-medium">
                        Month
                      </th>
                      <th className="px-3 py-1.5 text-right font-medium">
                        Tax
                      </th>
                      <th className="px-3 py-1.5 text-right font-medium">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tax.by_month.map((m: any) => (
                      <tr
                        key={m.month}
                        className="border-t border-[var(--separator-soft)]"
                      >
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                          {m.month}
                        </td>
                        <td className="financial px-3 py-1.5 text-right text-[var(--text-primary)]">
                          {formatCurrency(m.tax)}
                        </td>
                        <td className="financial px-3 py-1.5 text-right text-[var(--text-secondary)]">
                          {formatCurrency(m.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
