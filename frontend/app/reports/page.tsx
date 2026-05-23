"use client";

import { useEffect, useState } from "react";
import { apiGet, downloadFile } from "@/lib/api";
import { formatCurrency, titleCase } from "@/lib/format";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
} from "@/components/ui";

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        accent
          ? "border-blue-200 bg-blue-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-semibold ${
          accent ? "text-accent" : "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  exportType,
  onExportError,
}: {
  title: string;
  children: React.ReactNode;
  exportType?: string;
  onExportError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function doExport(format: "csv" | "pdf") {
    if (!exportType) return;
    setBusy(format);
    try {
      await downloadFile(
        `/reports/export?type=${exportType}&format=${format}`,
        `${exportType}.${format}`
      );
    } catch (err: any) {
      onExportError(err?.message || "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {exportType ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => doExport("csv")}
              disabled={busy !== null}
            >
              {busy === "csv" ? "..." : "Export CSV"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => doExport("pdf")}
              disabled={busy !== null}
            >
              {busy === "pdf" ? "..." : "Export PDF"}
            </Button>
          </div>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <EmptyState message={empty} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
            {headers.map((h, i) => (
              <th
                key={i}
                className={`py-2 px-2 ${i > 0 ? "text-right" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, ri) => (
            <tr key={ri} className="border-b border-gray-100">
              {cells.map((c, ci) => (
                <td
                  key={ci}
                  className={`py-2 px-2 ${
                    ci > 0
                      ? "text-right text-gray-700"
                      : "text-gray-900"
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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

      // If everything failed, treat as a hard error (backend unreachable).
      const allFailed = results.every((r) => r.status === "rejected");
      if (allFailed) {
        const first = results[0] as PromiseRejectedResult;
        throw new Error(
          first.reason?.message || "Failed to load reports."
        );
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

  useEffect(() => {
    load();
  }, []);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Revenue, invoices, payments and tax analytics."
      />

      {exportError ? (
        <ErrorState message={exportError} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard
          label="Total Revenue"
          value={formatCurrency(summary?.total_revenue)}
          accent
        />
        <KpiCard
          label="Outstanding"
          value={formatCurrency(summary?.total_outstanding)}
        />
        <KpiCard
          label="Paid Invoices"
          value={String(counts.paid ?? 0)}
        />
        <KpiCard
          label="Pending"
          value={String(counts.pending ?? counts.sent ?? 0)}
        />
        <KpiCard
          label="Overdue"
          value={String(counts.overdue ?? 0)}
        />
        <KpiCard
          label="Partial Payments"
          value={String(counts.partially_paid ?? 0)}
        />
        <KpiCard
          label="Total Tax"
          value={formatCurrency(summary?.total_tax)}
        />
        <KpiCard
          label="Total Invoiced"
          value={formatCurrency(summary?.total_invoiced)}
        />
      </div>

      <Section
        title="Monthly Revenue"
        exportType="revenue"
        onExportError={setExportError}
      >
        <SimpleTable
          headers={["Month", "Revenue"]}
          rows={(revenue?.monthly || []).map((m: any) => [
            m.month,
            formatCurrency(m.revenue),
          ])}
          empty="No revenue data available."
        />
        {revenue?.total_revenue != null ? (
          <div className="mt-3 text-right text-sm font-semibold text-gray-900">
            Total: {formatCurrency(revenue.total_revenue)}
          </div>
        ) : null}
      </Section>

      <Section
        title="Invoices by Status"
        exportType="invoices"
        onExportError={setExportError}
      >
        <SimpleTable
          headers={["Status", "Count", "Amount"]}
          rows={(invoices?.by_status || []).map((s: any) => [
            titleCase(s.status),
            String(s.count ?? 0),
            formatCurrency(s.amount),
          ])}
          empty="No invoice status data available."
        />
      </Section>

      <Section
        title="Invoice Aging"
        exportType="aging"
        onExportError={setExportError}
      >
        <SimpleTable
          headers={["Bucket", "Count", "Amount"]}
          rows={(invoices?.aging || []).map((a: any) => [
            a.bucket,
            String(a.count ?? 0),
            formatCurrency(a.amount),
          ])}
          empty="No aging data available."
        />
      </Section>

      <Section
        title="Payment Method Summary"
        exportType="payments"
        onExportError={setExportError}
      >
        <SimpleTable
          headers={["Method", "Count", "Amount"]}
          rows={(paymentsRep?.by_method || []).map((m: any) => [
            titleCase(m.method),
            String(m.count ?? 0),
            formatCurrency(m.amount),
          ])}
          empty="No payment method data available."
        />
        {paymentsRep?.total != null ? (
          <div className="mt-3 text-right text-sm font-semibold text-gray-900">
            Total: {formatCurrency(paymentsRep.total)}
          </div>
        ) : null}
      </Section>

      <Section
        title="Customer-wise Revenue"
        exportType="customers"
        onExportError={setExportError}
      >
        <SimpleTable
          headers={["Customer", "Invoices", "Invoiced", "Paid", "Balance"]}
          rows={customers.map((c: any) => [
            c.customer,
            String(c.invoice_count ?? 0),
            formatCurrency(c.invoiced),
            formatCurrency(c.paid),
            formatCurrency(c.balance),
          ])}
          empty="No customer data available."
        />
      </Section>

      <Section
        title="Tax Summary"
        exportType="tax"
        onExportError={setExportError}
      >
        <SimpleTable
          headers={["Month", "Subtotal", "Discount", "Tax", "Total"]}
          rows={(tax?.by_month || []).map((m: any) => [
            m.month,
            formatCurrency(m.subtotal),
            formatCurrency(m.discount),
            formatCurrency(m.tax),
            formatCurrency(m.total),
          ])}
          empty="No tax data available."
        />
        {tax ? (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded bg-gray-50 p-2">
              <div className="text-xs text-gray-500">Subtotal</div>
              <div className="font-semibold text-gray-900">
                {formatCurrency(tax.total_subtotal)}
              </div>
            </div>
            <div className="rounded bg-gray-50 p-2">
              <div className="text-xs text-gray-500">Discount</div>
              <div className="font-semibold text-gray-900">
                {formatCurrency(tax.total_discount)}
              </div>
            </div>
            <div className="rounded bg-gray-50 p-2">
              <div className="text-xs text-gray-500">Tax</div>
              <div className="font-semibold text-gray-900">
                {formatCurrency(tax.total_tax)}
              </div>
            </div>
            <div className="rounded bg-gray-50 p-2">
              <div className="text-xs text-gray-500">Total</div>
              <div className="font-semibold text-gray-900">
                {formatCurrency(tax.total_amount)}
              </div>
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Summary Export"
        exportType="summary"
        onExportError={setExportError}
      >
        <p className="text-sm text-gray-500">
          Download the overall summary report as CSV or PDF.
        </p>
      </Section>
    </div>
  );
}
