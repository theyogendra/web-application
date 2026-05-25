"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPut, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { isAdmin } from "@/lib/auth";
import {
  Button,
  Card,
  ErrorState,
  Loading,
  PageHeader,
} from "@/components/ui";

export default function UserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    setAdmin(isAdmin());
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/users/${id}`);
      setUser(data?.data || data);
    } catch (err: any) {
      setError(err?.message || "Failed to load user.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function flash(msg: string) {
    setActionMsg(msg);
    setActionError(null);
    setTimeout(() => setActionMsg(null), 5000);
  }
  function flashError(msg: string) {
    setActionError(msg);
    setActionMsg(null);
  }

  async function handleDeactivate() {
    if (
      !window.confirm(
        "Deactivate this user? They will no longer be able to sign in.",
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const res = await apiDelete(`/users/${id}`);
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to deactivate user.");
      }
      flash("User deactivated.");
      load();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 400) {
        flashError(err.message || "Cannot deactivate your own account.");
      } else {
        flashError(err?.message || "Failed to deactivate user.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleResetPassword() {
    const pw = window.prompt(
      "Enter a new password for this user (at least 8 characters):",
    );
    if (!pw) return;
    if (pw.length < 8) {
      flashError("Password must be at least 8 characters.");
      return;
    }
    setBusy("password");
    try {
      const res = await apiPut(`/users/${id}`, { password: pw });
      if (res && res.success === false) {
        throw new Error(res.message || "Failed to reset password.");
      }
      flash("Password updated.");
    } catch (err: any) {
      flashError(err?.message || "Failed to reset password.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <Loading label="Loading user..." />;
  }

  if (error) {
    return (
      <div>
        <PageHeader title="User" />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <PageHeader title="User" />
        <ErrorState message="User not found." />
      </div>
    );
  }

  const moduleAccess = user.module_access || {};
  const accessEntries = Object.entries(moduleAccess).filter(
    ([, v]) => v === "view" || v === "edit",
  ) as Array<[string, string]>;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={user.full_name || user.name || "User"}
        description={user.email}
        actions={
          <>
            {admin ? (
              <Link href={`/users/${id}/edit`}>
                <Button variant="secondary">Edit</Button>
              </Link>
            ) : null}
            {admin ? (
              <Button
                variant="secondary"
                onClick={handleResetPassword}
                disabled={busy !== null}
              >
                {busy === "password" ? "Saving..." : "Reset password"}
              </Button>
            ) : null}
            {admin && user.is_active ? (
              <Button
                variant="danger"
                onClick={handleDeactivate}
                disabled={busy !== null}
              >
                {busy === "delete" ? "Working..." : "Deactivate"}
              </Button>
            ) : null}
          </>
        }
      />

      {actionMsg ? (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {actionMsg}
        </div>
      ) : null}
      {actionError ? (
        <div className="mb-4">
          <ErrorState message={actionError} />
        </div>
      ) : null}

      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Status
            </div>
            <div className="mt-1">
              {user.is_active ? (
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
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Role
            </div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              {user.role?.name || "—"}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Contact
            </div>
            <div className="mt-1 text-sm text-gray-900">{user.email}</div>
            <div className="text-sm text-gray-500">{user.phone || "—"}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Activity
            </div>
            <div className="mt-1 text-sm text-gray-600">
              Last login:{" "}
              {user.last_login_at ? formatDateTime(user.last_login_at) : "Never"}
            </div>
            <div className="text-sm text-gray-600">
              Created:{" "}
              {user.created_at ? formatDateTime(user.created_at) : "—"}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-base font-semibold text-gray-900">
          Module Access
        </h2>
        <p className="mb-4 text-xs text-ink-500">
          {user.role?.name === "Admin" || user.is_superuser
            ? "Admins have full access to every module."
            : user.role?.name === "Manager"
            ? "Managers can view and edit every module except user management."
            : "Granted modules and access level."}
        </p>
        {accessEntries.length === 0 ? (
          <p className="text-sm text-gray-500">
            {user.role?.name === "Employee"
              ? "No module access granted yet."
              : "—"}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {accessEntries.map(([m, lvl]) => (
              <span
                key={m}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  lvl === "edit"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-brand-50 text-brand-700"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    lvl === "edit" ? "bg-emerald-500" : "bg-brand-500"
                  }`}
                />
                {m.charAt(0).toUpperCase() + m.slice(1)} · {lvl}
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
