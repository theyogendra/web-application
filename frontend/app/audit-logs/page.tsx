"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, downloadFile } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import { isStaff } from "@/lib/auth";
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
import ExportButton from "@/components/ExportButton";
import { ExportColumn } from "@/lib/ExportService";

const AUDIT_COLUMNS: ExportColumn[] = [
  {
    label: "Time",
    key: "created_at",
    value: (row: any) =>
      row.created_at
        ? new Date(row.created_at).toISOString().replace("T", " ").slice(0, 19)
        : "",
  },
  { label: "User Name", key: "user_name" },
  { label: "Action", key: "action" },
  { label: "Module", key: "module" },
  { label: "Entity Type", key: "entity_type" },
  { label: "Entity ID", key: "entity_id" },
  { label: "IP Address", key: "ip_address" },
];

// Values MUST match the Title-Case strings the backend audit service writes
// (see backend/src/services/audit.service.js#moduleForAction). Lower-case
// values silently filter to zero rows.
const MODULES = [
  { value: "", label: "All modules" },
  { value: "Invoices", label: "Invoices" },
  { value: "Payments", label: "Payments" },
  { value: "Quotations", label: "Quotations" },
  { value: "Proposals", label: "Proposals" },
  { value: "Inventory", label: "Inventory" },
  { value: "Reports", label: "Reports" },
  { value: "Audit Logs", label: "Audit Logs" },
  { value: "Auth", label: "Auth" },
  { value: "Email", label: "Email" },
  { value: "Settings", label: "Settings" },
];

export default function AuditLogsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [moduleFilter, setModuleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Audit Logs is staff-only. Non-staff get bounced to /invoices to avoid a
  // flash of forbidden content (the backend also 403s the API).
  useEffect(() => {
    if (!isStaff()) {
      router.replace("/invoices");
      return;
    }
    setAllowed(true);
  }, [router]);

  function buildParams() {
    const params = new URLSearchParams();
    if (moduleFilter) params.set("module", moduleFilter);
    if (search) params.set("search", search);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("limit", "200");
    return params;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = buildParams().toString();
      const res = await apiGet("/audit-logs" + (qs ? "?" + qs : ""));
      const list = Array.isArray(res) ? res : res?.data || [];
      setLogs(list);
    } catch (err: any) {
      setError(err?.message || "Failed to load audit logs.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  function clearFilters() {
    setModuleFilter("");
    setSearch("");
    setFrom("");
    setTo("");
    setTimeout(load, 0);
  }

  if (!allowed) {
    return <Loading label="Redirecting..." />;
  }

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="System activity across all modules."
        actions={
          <ExportButton
            title="Audit Logs Report"
            filename={`Audit_Logs_Report_${new Date().toISOString().slice(0, 10)}`}
            columns={AUDIT_COLUMNS}
            data={logs}
            pdfUrl={`/audit-logs/export${buildParams().toString() ? "?" + buildParams().toString() : ""}`}
            requiredPermission="audit_logs.export"
          />
        }
      />

      <Card className="mb-5 p-4">
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <Field label="Module">
            <Select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
            >
              {MODULES.map((m) => (
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
              placeholder="User, action or entity"
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
          <Loading label="Loading audit logs..." />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState message="No audit logs found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-gray-600">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {log.user_name || log.user_id || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {titleCase(log.action)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {titleCase(log.module)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.entity_type
                        ? `${titleCase(log.entity_type)}${
                            log.entity_id ? " #" + log.entity_id : ""
                          }`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {log.ip_address || "-"}
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
