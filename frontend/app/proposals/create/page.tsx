"use client";

import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";
import DocumentForm, {
  buildInitialDocumentValues,
} from "@/components/DocumentForm";
import { PageHeader } from "@/components/ui";

export default function CreateProposalPage() {
  const router = useRouter();

  async function handleSubmit(payload: any) {
    const res = await apiPost("/proposals", payload);
    if (res && res.success === false) {
      const msg =
        (Array.isArray(res.errors) && res.errors.join(", ")) ||
        res.message ||
        "Failed to create proposal.";
      throw new Error(msg);
    }
    const created = res?.data || res;
    const id = created?.id;
    if (id) {
      router.push(`/proposals/${id}`);
    } else {
      router.push("/proposals");
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New Proposal"
        description="Draft a proposal with scope, line items and terms."
      />
      <DocumentForm
        kind="proposal"
        initialValues={buildInitialDocumentValues("proposal")}
        submitLabel="Create Proposal"
        onSubmit={handleSubmit}
        onCancel={() => router.push("/proposals")}
      />
    </div>
  );
}
