"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { canEdit as canEditModule } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
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

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [mayEdit, setMayEdit] = useState(false);
  useEffect(() => {
    setMayEdit(canEditModule("invoices"));
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const data = await apiGet("/invoices" + (qs ? "?" + qs : ""));
      // Endpoint returns a JSON array.
      const list = Array.isArray(data) ? data : data?.data || [];
      setInvoices(list);
    } catch (err: any) {
      setError(err?.message || "Failed to load invoices.");
      setInvoices([]);
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
    setStatus("");
    setSearch("");
    setFrom("");
    setTo("");
    setTimeout(load, 0);
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Create, track and manage customer invoices."
        actions={
          mayEdit ? (
            <Link href="/invoices/create">
              <Button>+ New Invoice</Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-5 p-4">
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Search">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Invoice # or customer"
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
          <Loading label="Loading invoices..." />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : invoices.length === 0 ? (
          <EmptyState message="No invoices found. Create your first invoice to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => router.push(`/invoices/${inv.id}`)}
                    className={`cursor-pointer border-b border-gray-100 hover:bg-blue-50 ${
                      inv.is_overdue ? "bg-red-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-accent">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">
                        {inv.customer_name}
                      </div>
                      <div className="text-xs text-gray-400">
                        {inv.customer_email}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(inv.invoice_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(inv.due_date)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={inv.status}
                        isOverdue={inv.is_overdue}
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatCurrency(inv.grand_total)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(inv.paid_amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(inv.balance_due)}
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
