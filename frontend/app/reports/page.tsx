"use client";

import { useEffect, useMemo, useState } from "react";
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
  Clock,
  AlertTriangle,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { apiGet, downloadFile } from "@/lib/api";
import { formatCurrency, titleCase } from "@/lib/format";
import { Button, Card, EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui";
import StatCard from "@/components/StatCard";

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

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        apiGet("/reports/summary"),
        apiGet("/reports/revenue"),
        apiGet("/reports/invoices"),
        apiGet("/reports/payments"),
        apiGet("/reports/customers"),
        apiGet("/reports/tax"),
      ]);
      const get = (i: number) =>
        results[i].status === "fulfilled"
          ? (results[i] as PromiseFulfilledResult<any>).value
          : null;
      const allFailed = results.every((r) => r.status === "rejected");
      if (allFailed) {
        const first = results[0] as PromiseRejectedResult;
        throw new Error(first.reason?.message || "Failed to load reports.");
      }
      setSummary(get(0)?.data || null);
      setRevenue(get(1)?.data || null);
      setInvoices(get(2)?.data || null);
      setPaymentsRep(get(3)?.data || null);
      const cust = get(4)?.data;
      setCustomers(Array.isArray(cust) ? cust : []);
      setTax(get(5)?.data || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

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

  async function doExport(type: string, format: "csv" | "pdf") {
    const key = `${type}-${format}`;
    setExporting(key);
    setExportError(null);
    try {
      await downloadFile(`/reports/export?type=${type}&format=${format}`, `${type}.${format}`);
    } catch (err: any) {
      setExportError(err?.message || "Export failed.");
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
          <Button
            variant="secondary"
            onClick={() => doExport("summary", "pdf")}
            disabled={!!exporting}
          >
            <Download size={14} />
            {exporting === "summary-pdf" ? "Exporting..." : "Export summary"}
          </Button>
        }
      />

      {exportError ? <ErrorState message={exportError} /> : null}

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
                <Button variant="ghost" size="sm" onClick={() => doExport("revenue", "csv")}>
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
                  <AreaChart data={monthlyData} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="revenueArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#0A84FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--separator-soft)" vertical={false} />
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
                      tickFormatter={(v) => "₹" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      formatter={(v: any) => formatCurrency(v)}
                      labelStyle={{ color: "var(--text-secondary)", fontSize: 11 }}
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
          transition={{ duration: 0.3, delay: 0.10 }}
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
                      wrapperStyle={{ fontSize: 11.5, color: "var(--text-secondary)" }}
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
              <Button variant="ghost" size="sm" onClick={() => doExport("payments", "csv")}>
                <FileSpreadsheet size={13} />
                CSV
              </Button>
            </div>
            {methodData.length === 0 ? (
              <EmptyState message="No payment data yet." />
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={methodData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--separator-soft)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => "₹" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      formatter={(v: any) => formatCurrency(v)}
                    />
                    <Bar dataKey="amount" radius={[6, 6, 0, 0]} animationDuration={700}>
                      {methodData.map((entry: any, idx: number) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Aging snapshot */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.20 }}
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
                  0
                );
                const pct = total > 0 ? ((Number(row.amount) || 0) / total) * 100 : 0;
                const tone =
                  row.bucket === "90+" ? "bg-[#FF3B30]"
                  : row.bucket === "61-90" ? "bg-[#FF9500]"
                  : row.bucket === "31-60" ? "bg-[#FF9F0A]"
                  : row.bucket === "1-30" ? "bg-[#FFCC00]"
                  : "bg-[#34C759]";
                return (
                  <div key={row.bucket}>
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="text-[var(--text-secondary)]">{row.bucket}</span>
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
              <Button variant="ghost" size="sm" onClick={() => doExport("customers", "csv")}>
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
          transition={{ duration: 0.3, delay: 0.30 }}
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
              <Button variant="ghost" size="sm" onClick={() => doExport("tax", "csv")}>
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
                      <th className="px-3 py-1.5 text-left font-medium">Month</th>
                      <th className="px-3 py-1.5 text-right font-medium">Tax</th>
                      <th className="px-3 py-1.5 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tax.by_month.map((m: any) => (
                      <tr key={m.month} className="border-t border-[var(--separator-soft)]">
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{m.month}</td>
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
