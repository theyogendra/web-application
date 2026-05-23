"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, downloadFile } from "@/lib/api";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  PageHeader,
  Select,
  TextInput,
} from "@/components/ui";

const PAYMENT_METHODS = [
  { value: "", label: "All methods" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "online", label: "Online" },
];

export default function PaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function buildParams() {
    const params = new URLSearchParams();
    if (method) params.set("payment_method", method);
    if (search) params.set("search", search);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = buildParams().toString();
      const res = await apiGet("/payments" + (qs ? "?" + qs : ""));
      const list = Array.isArray(res) ? res : res?.data || [];
      setPayments(list);
    } catch (err: any) {
      setError(err?.message || "Failed to load payments.");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  function clearFilters() {
    setMethod("");
    setSearch("");
    setFrom("");
    setTo("");
    setTimeout(load, 0);
  }

  async function handleExport() {
    setExportError(null);
    setExporting(true);
    try {
      const qs = buildParams().toString();
      await downloadFile(
        "/payments/export" + (qs ? "?" + qs : ""),
        "payments.csv"
      );
    } catch (err: any) {
      setExportError(err?.message || "Failed to export payments.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Payments"
        description="All recorded payments across invoices."
        actions={
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        }
      />

      {exportError ? (
        <div className="mb-4">
          <ErrorState message={exportError} />
        </div>
      ) : null}

      <Card className="mb-5 p-4">
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <Field label="Method">
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Search">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Payment #, invoice or customer"
            />
          </Field>
          <Field label="From">
            <TextInput
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To">
            <TextInput
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit">Apply</Button>
            <Button variant="secondary" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        {loading ? (
          <Loading label="Loading payments..." />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : payments.length === 0 ? (
          <EmptyState message="No payments found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Payment #</th>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Reference</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {p.payment_number}
                    </td>
                    <td className="px-4 py-3">
                      {p.invoice_id ? (
                        <Link
                          href={`/invoices/${p.invoice_id}`}
                          className="text-accent hover:underline"
                        >
                          {p.invoices?.invoice_number || "View"}
                        </Link>
                      ) : (
                        p.invoices?.invoice_number || "-"
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {p.invoices?.customer_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {titleCase(p.payment_method)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(p.payment_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.reference_number || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
