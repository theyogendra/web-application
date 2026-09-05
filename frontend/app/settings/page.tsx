"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPut, ApiError } from "@/lib/api";
import {
  Button,
  Card,
  Field,
  Loading,
  PageHeader,
  TextInput,
  TextArea,
} from "@/components/ui";
import ExportButton from "@/components/ExportButton";
import { ExportColumn } from "@/lib/ExportService";

const SETTINGS_COLUMNS: ExportColumn[] = [
  { label: "Company Name", key: "company_name" },
  { label: "Contact Email", key: "email" },
  { label: "Contact Phone", key: "phone" },
  { label: "Address", key: "address" },
  { label: "Logo URL", key: "logo_url" },
  { label: "Tax Number / GSTIN", key: "tax_number" },
  { label: "Invoice Prefix", key: "invoice_prefix" },
  { label: "Currency", key: "currency" },
  { label: "Default Payment Terms", key: "default_terms" },
  { label: "Default Invoice Notes", key: "default_notes" },
];

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    company_name: "",
    email: "",
    phone: "",
    address: "",
    logo_url: "",
    tax_number: "",
    invoice_prefix: "",
    currency: "INR",
    default_terms: "",
    default_notes: "",
  });

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet("/company-settings");
      if (response && response.success && response.data) {
        const d = response.data;
        setSettings({
          company_name: d.company_name || "",
          email: d.email || "",
          phone: d.phone || "",
          address: d.address || "",
          logo_url: d.logo_url || "",
          tax_number: d.tax_number || "",
          invoice_prefix: d.invoice_prefix || "",
          currency: d.currency || "INR",
          default_terms: d.default_terms || "",
          default_notes: d.default_notes || "",
        });
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load company settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiPut("/company-settings", settings);
      if (response && response.success && response.data) {
        setSuccess("Company settings updated successfully.");
        // Clear success message after 4 seconds
        setTimeout(() => setSuccess(null), 4000);
      } else {
        throw new Error("Failed to save company settings.");
      }
    } catch (err: any) {
      setError(err?.message || "An error occurred while saving settings.");
    } finally {
      setSaving(false);
    }
  }

  const handleChange = (key: keyof typeof settings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <Loading label="Loading company settings..." />;
  }

  return (
    <div className="max-w-4xl animate-fade-in">
      <PageHeader
        title="Company Settings"
        description="Configure your enterprise profile, billing prefixes, tax information, and document defaults."
        actions={
          <ExportButton
            title="Company Profile Settings"
            filename={`Company_Settings_${new Date().toISOString().slice(0, 10)}`}
            columns={SETTINGS_COLUMNS}
            data={[settings]}
            isDocument={true}
            documentData={settings}
            requiredPermission="settings.read"
          />
        }
      />

      {error && (
        <div className="mb-6">
          <div className="rounded-xl border border-[#FF3B30]/20 bg-[#FF3B30]/5 p-4 text-[14px] text-[#FF3B30]">
            <p className="font-semibold">Error</p>
            <p className="mt-1 opacity-90">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-6">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-[14px] text-emerald-600 dark:text-emerald-500">
            <p className="font-semibold">Success</p>
            <p className="mt-1 opacity-90">{success}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6">
          <h2 className="mb-4 text-[16px] font-semibold text-[var(--text-primary)]">
            Profile Information
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company Name" required>
              <TextInput
                value={settings.company_name}
                onChange={(e) => handleChange("company_name", e.target.value)}
                placeholder="e.g. Acme Corp"
                required
                disabled={saving}
              />
            </Field>

            <Field label="Logo URL">
              <TextInput
                value={settings.logo_url}
                onChange={(e) => handleChange("logo_url", e.target.value)}
                placeholder="https://example.com/logo.png"
                disabled={saving}
              />
            </Field>

            <Field label="Contact Email">
              <TextInput
                type="email"
                value={settings.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="billing@company.com"
                disabled={saving}
              />
            </Field>

            <Field label="Contact Phone">
              <TextInput
                type="tel"
                value={settings.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="+1 (555) 000-0000"
                disabled={saving}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Address">
                <TextArea
                  value={settings.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                  placeholder="123 Corporate Blvd, Suite 100, City, Country"
                  disabled={saving}
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-[16px] font-semibold text-[var(--text-primary)]">
            Billing & Invoicing Configuration
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Tax Number / GSTIN">
              <TextInput
                value={settings.tax_number}
                onChange={(e) => handleChange("tax_number", e.target.value)}
                placeholder="e.g. GSTIN123456"
                disabled={saving}
              />
            </Field>

            <Field label="Invoice Prefix">
              <TextInput
                value={settings.invoice_prefix}
                onChange={(e) => handleChange("invoice_prefix", e.target.value)}
                placeholder="e.g. INV-"
                disabled={saving}
              />
            </Field>

            <Field label="Currency">
              <TextInput
                value={settings.currency}
                onChange={(e) => handleChange("currency", e.target.value)}
                placeholder="e.g. USD, INR, EUR"
                disabled={saving}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-[16px] font-semibold text-[var(--text-primary)]">
            Document Defaults
          </h2>
          <div className="space-y-4">
            <Field label="Default Payment Terms">
              <TextArea
                value={settings.default_terms}
                onChange={(e) => handleChange("default_terms", e.target.value)}
                placeholder="Payment is due within 30 days of invoice date."
                disabled={saving}
              />
            </Field>

            <Field label="Default Invoice Notes">
              <TextArea
                value={settings.default_notes}
                onChange={(e) => handleChange("default_notes", e.target.value)}
                placeholder="Thank you for your business!"
                disabled={saving}
              />
            </Field>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => router.push("/reports")}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving Changes..." : "Save Settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}
