"use client";

import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";
import InvoiceForm, {
  buildInitialValues,
  InvoiceFormValues,
} from "@/components/InvoiceForm";
import { PageHeader } from "@/components/ui";

export default function CreateInvoicePage() {
  const router = useRouter();

  async function handleSubmit(values: InvoiceFormValues) {
    const res = await apiPost("/invoices", values);
    if (res && res.success === false) {
      const msg =
        (Array.isArray(res.errors) && res.errors.join(", ")) ||
        res.message ||
        "Failed to create invoice.";
      throw new Error(msg);
    }
    const created = res?.data || res;
    const id = created?.id;
    if (id) {
      router.push(`/invoices/${id}`);
    } else {
      router.push("/invoices");
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New Invoice"
        description="Fill in customer details and line items."
      />
      <InvoiceForm
        initialValues={buildInitialValues()}
        submitLabel="Create Invoice"
        onSubmit={handleSubmit}
        onCancel={() => router.push("/invoices")}
      />
    </div>
  );
}
