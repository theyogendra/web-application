"use client";

import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";
import DocumentForm, {
  buildInitialDocumentValues,
} from "@/components/DocumentForm";
import { PageHeader } from "@/components/ui";

export default function CreateQuotationPage() {
  const router = useRouter();

  async function handleSubmit(payload: any) {
    const res = await apiPost("/quotations", payload);
    if (res && res.success === false) {
      const msg =
        (Array.isArray(res.errors) && res.errors.join(", ")) ||
        res.message ||
        "Failed to create quotation.";
      throw new Error(msg);
    }
    const created = res?.data || res;
    const id = created?.id;
    if (id) {
      router.push(`/quotations/${id}`);
    } else {
      router.push("/quotations");
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New Quotation"
        description="Draft a quotation to send to your customer."
      />
      <DocumentForm
        kind="quotation"
        initialValues={buildInitialDocumentValues("quotation")}
        submitLabel="Create Quotation"
        onSubmit={handleSubmit}
        onCancel={() => router.push("/quotations")}
      />
    </div>
  );
}
