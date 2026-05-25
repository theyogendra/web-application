"use client";

import React, { useEffect, useState } from "react";
import {
  Button,
  Card,
  ErrorState,
  Field,
  Select,
  TextInput,
} from "@/components/ui";
import { apiGet } from "@/lib/api";

export type ModuleAccessMap = Record<
  "inventory" | "proposals" | "quotations" | "invoices" | "payments",
  "none" | "view" | "edit"
>;

export type UserFormValues = {
  name: string;
  email: string;
  phone: string;
  password: string;
  role_id: string;
  is_active: boolean;
  module_access: ModuleAccessMap;
};

const MODULES: Array<{ key: keyof ModuleAccessMap; label: string }> = [
  { key: "inventory", label: "Inventory" },
  { key: "proposals", label: "Proposals" },
  { key: "quotations", label: "Quotations" },
  { key: "invoices", label: "Invoices" },
  { key: "payments", label: "Payments" },
];

export function emptyModuleAccess(): ModuleAccessMap {
  return {
    inventory: "none",
    proposals: "none",
    quotations: "none",
    invoices: "none",
    payments: "none",
  };
}

export function buildInitialUserValues(user?: any): UserFormValues {
  if (!user) {
    return {
      name: "",
      email: "",
      phone: "",
      password: "",
      role_id: "",
      is_active: true,
      module_access: emptyModuleAccess(),
    };
  }
  const ma: ModuleAccessMap = emptyModuleAccess();
  const src = user.module_access || {};
  for (const m of MODULES) {
    const v = src[m.key];
    if (v === "view" || v === "edit") ma[m.key] = v;
  }
  return {
    name: user.full_name || user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    password: "",
    role_id: user.role?.id || user.role_id || "",
    is_active: user.is_active !== false,
    module_access: ma,
  };
}

type Props = {
  initialValues: UserFormValues;
  submitLabel: string;
  isEdit?: boolean;
  onSubmit: (payload: any) => Promise<void>;
  onCancel?: () => void;
};

export default function UserForm({
  initialValues,
  submitLabel,
  isEdit = false,
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState<UserFormValues>(initialValues);
  const [roles, setRoles] = useState<any[]>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // On edit, password is optional — only included when the user opts in.
  const [changePassword, setChangePassword] = useState(false);

  function setField<K extends keyof UserFormValues>(field: K, value: UserFormValues[K]) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  function setModuleAccess(
    key: keyof ModuleAccessMap,
    value: ModuleAccessMap[keyof ModuleAccessMap],
  ) {
    setValues((v) => ({
      ...v,
      module_access: { ...v.module_access, [key]: value },
    }));
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet("/roles");
        const list = Array.isArray(res) ? res : res?.data || [];
        setRoles(list);
      } catch (err: any) {
        setRolesError(err?.message || "Failed to load roles.");
      }
    })();
  }, []);

  const selectedRole = roles.find((r) => r.id === values.role_id);
  const roleName = selectedRole?.name || "";
  const isEmployeeRole = roleName === "Employee";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!values.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!values.email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!values.role_id) {
      setError("Please select a role.");
      return;
    }
    if (!isEdit && !values.password) {
      setError("Password is required.");
      return;
    }
    if (isEdit && changePassword && !values.password) {
      setError("Enter a new password or uncheck 'Change password'.");
      return;
    }

    const moduleAccessPayload: Record<string, "view" | "edit"> = {};
    if (isEmployeeRole) {
      for (const m of MODULES) {
        const v = values.module_access[m.key];
        if (v === "view" || v === "edit") moduleAccessPayload[m.key] = v;
      }
    }

    const payload: any = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim() || null,
      role_id: values.role_id,
      is_active: !!values.is_active,
      module_access: moduleAccessPayload,
    };
    if (!isEdit) {
      payload.password = values.password;
    } else if (changePassword) {
      payload.password = values.password;
    }

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err: any) {
      const apiBody = err?.body;
      let msg = err?.message || "Failed to save user.";
      if (apiBody && typeof apiBody === "object") {
        if (Array.isArray(apiBody.errors) && apiBody.errors.length > 0) {
          msg = apiBody.errors.join(", ");
        } else if (apiBody.message) {
          msg = apiBody.message;
        }
      }
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <ErrorState message={error} /> : null}
      {rolesError ? <ErrorState message={rolesError} /> : null}

      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Account
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <TextInput
              value={values.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Priya Sharma"
            />
          </Field>
          <Field label="Email" required>
            <TextInput
              type="email"
              value={values.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="priya@company.com"
              disabled={isEdit}
            />
          </Field>
          <Field label="Phone">
            <TextInput
              value={values.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Role" required>
            <Select
              value={values.role_id}
              onChange={(e) => setField("role_id", e.target.value)}
            >
              <option value="">Select a role…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          {!isEdit ? (
            <Field label="Password" required>
              <TextInput
                type="password"
                value={values.password}
                onChange={(e) => setField("password", e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </Field>
          ) : (
            <div>
              <label className="mt-7 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={changePassword}
                  onChange={(e) => setChangePassword(e.target.checked)}
                />
                Change password
              </label>
              {changePassword ? (
                <div className="mt-3">
                  <Field label="New password" required>
                    <TextInput
                      type="password"
                      value={values.password}
                      onChange={(e) => setField("password", e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          )}
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={values.is_active}
                onChange={(e) => setField("is_active", e.target.checked)}
              />
              Active
            </label>
          </div>
        </div>
      </Card>

      {isEmployeeRole ? (
        <Card className="p-5">
          <h2 className="mb-1 text-base font-semibold text-gray-900">
            Module Access
          </h2>
          <p className="mb-4 text-xs text-ink-500">
            Choose how this employee can use each module. Admins and Managers
            implicitly have full access.
          </p>
          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_repeat(3,_minmax(0,_1fr))] gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-ink-400 sm:grid">
              <div>Module</div>
              <div className="text-center">No access</div>
              <div className="text-center">View</div>
              <div className="text-center">Edit</div>
            </div>
            {MODULES.map((m) => {
              const value = values.module_access[m.key];
              return (
                <div
                  key={m.key}
                  className="grid grid-cols-2 items-center gap-2 rounded-lg border border-ink-100 bg-ink-50/40 px-3 py-2 text-sm sm:grid-cols-[1fr_repeat(3,_minmax(0,_1fr))]"
                >
                  <div className="font-medium text-ink-700">{m.label}</div>
                  {(["none", "view", "edit"] as const).map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center justify-center gap-1.5 text-xs text-ink-600 sm:text-sm"
                    >
                      <input
                        type="radio"
                        name={`ma-${m.key}`}
                        value={opt}
                        checked={value === opt}
                        onChange={() => setModuleAccess(m.key, opt)}
                      />
                      <span className="sm:hidden">
                        {opt === "none" ? "No access" : opt === "view" ? "View" : "Edit"}
                      </span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
