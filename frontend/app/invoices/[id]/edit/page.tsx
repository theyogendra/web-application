"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPut } from "@/lib/api";
import InvoiceForm, {
  buildInitialValues,
  InvoiceFormValues,
} from "@/components/InvoiceForm";
import { ErrorState, Loading, PageHeader } from "@/components/ui";

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/invoices/${id}`);
      setInvoice(data?.data || data);
    } catch (err: any) {
      setError(err?.message || "Failed to load invoice.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(values: InvoiceFormValues) {
    const res = await apiPut(`/invoices/${id}`, values);
    if (res && res.success === false) {
      const msg =
        (Array.isArray(res.errors) && res.errors.join(", ")) ||
        res.message ||
        "Failed to update invoice.";
      throw new Error(msg);
    }
    router.push(`/invoices/${id}`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Edit Invoice"
        description={
          invoice ? `Editing ${invoice.invoice_number}` : "Loading..."
        }
      />
      {loading ? (
        <Loading label="Loading invoice..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <InvoiceForm
          initialValues={buildInitialValues(invoice)}
          submitLabel="Save Changes"
          onSubmit={handleSubmit}
          onCancel={() => router.push(`/invoices/${id}`)}
        />
      )}
    </div>
  );
}
