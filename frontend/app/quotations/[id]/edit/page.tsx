"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPut } from "@/lib/api";
import DocumentForm, {
  buildInitialDocumentValues,
} from "@/components/DocumentForm";
import { ErrorState, Loading, PageHeader } from "@/components/ui";

export default function EditQuotationPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [quotation, setQuotation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/quotations/${id}`);
      setQuotation(data?.data || data);
    } catch (err: any) {
      setError(err?.message || "Failed to load quotation.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(payload: any) {
    const res = await apiPut(`/quotations/${id}`, payload);
    if (res && res.success === false) {
      const msg =
        (Array.isArray(res.errors) && res.errors.join(", ")) ||
        res.message ||
        "Failed to update quotation.";
      throw new Error(msg);
    }
    router.push(`/quotations/${id}`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Edit Quotation"
        description={
          quotation ? `Editing ${quotation.quotation_number}` : "Loading..."
        }
      />
      {loading ? (
        <Loading label="Loading quotation..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <DocumentForm
          kind="quotation"
          initialValues={buildInitialDocumentValues("quotation", quotation)}
          submitLabel="Save Changes"
          onSubmit={handleSubmit}
          onCancel={() => router.push(`/quotations/${id}`)}
        />
      )}
    </div>
  );
}
