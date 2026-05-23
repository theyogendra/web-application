"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
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
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "converted", label: "Converted" },
];

export default function QuotationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

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
      const data = await apiGet("/quotations" + (qs ? "?" + qs : ""));
      const list = Array.isArray(data) ? data : data?.data || [];
      setItems(list);
    } catch (err: any) {
      setError(err?.message || "Failed to load quotations.");
      setItems([]);
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
        title="Quotations"
        description="Send quotations and convert them to invoices when accepted."
        actions={
          <Link href="/quotations/create">
            <Button>+ New Quotation</Button>
          </Link>
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
              placeholder="Quotation # or customer"
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
          <Loading label="Loading quotations..." />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState message="No quotations found. Create your first quotation to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Quotation #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Valid Until</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => router.push(`/quotations/${q.id}`)}
                    className={`cursor-pointer border-b border-gray-100 hover:bg-blue-50 ${
                      q.is_expired ? "bg-orange-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-accent">
                      {q.quotation_number}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{q.customer_name}</div>
                      <div className="text-xs text-gray-400">
                        {q.customer_email}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(q.quotation_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(q.valid_until)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex flex-wrap gap-1.5">
                        <StatusBadge status={q.status} />
                        {q.is_expired ? <StatusBadge status="expired" /> : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(q.grand_total)}
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
