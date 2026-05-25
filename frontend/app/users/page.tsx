"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { isAdmin } from "@/lib/auth";
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

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    setAdmin(isAdmin());
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status !== "") params.set("is_active", status);
      const qs = params.toString();
      const data = await apiGet("/users" + (qs ? "?" + qs : ""));
      const list = Array.isArray(data) ? data : data?.data || [];
      setUsers(list);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
      } else {
        setError(err?.message || "Failed to load users.");
      }
      setUsers([]);
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
    setSearch("");
    setStatus("");
    setTimeout(load, 0);
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage staff accounts, roles and per-module access."
        actions={
          admin ? (
            <Link href="/users/create">
              <Button>+ New User</Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-5 p-4">
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Field label="Search">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or email"
            />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2 lg:col-span-2">
            <Button type="submit">Apply</Button>
            <Button variant="secondary" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        {loading ? (
          <Loading label="Loading users..." />
        ) : forbidden ? (
          <div className="p-4">
            <ErrorState message="You don't have permission to manage users." />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : users.length === 0 ? (
          <EmptyState message="No users found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Modules</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Login</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const moduleAccess = u.module_access || {};
                  const chips = Object.entries(moduleAccess).filter(
                    ([, v]) => v === "view" || v === "edit",
                  ) as Array<[string, string]>;
                  return (
                    <tr
                      key={u.id}
                      onClick={() => router.push(`/users/${u.id}`)}
                      className="cursor-pointer border-b border-gray-100 hover:bg-blue-50"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {u.full_name || u.name || "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{u.email}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {u.role?.name || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {chips.length === 0 ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {chips.map(([m, lvl]) => (
                              <span
                                key={m}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  lvl === "edit"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-brand-50 text-brand-700"
                                }`}
                              >
                                {m}:{lvl}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {u.last_login_at ? formatDateTime(u.last_login_at) : "Never"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
